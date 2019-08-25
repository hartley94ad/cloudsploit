var shared = require(__dirname + '/../shared.js');
var functions = require('./functions.js');
var regLocations = require('./regions.js');
var govLocations = require('./regions_gov.js');

var async = require('async');
var sshpk = require('sshpk');
var assert = require('assert-plus');

// REST Oracle
var oci = require( '../../other_modules/oci' );

var regions = function(govcloud) {
    if (govcloud) return govLocations;
    return regLocations;
};

// Oracle Executor
function OracleExecutor (OracleConfig, Service) {
    this.oracleConfig = OracleConfig;
    this.oci = oci;

    this.client = {};

    this.run = function(collection, oracleService, callObj, callKey, callback){
        var OracleConfig = this.oracleConfig;
        var parameters = {};

        callObj.collection = collection;

        if (callObj.restVersion) OracleConfig.RESTversion = callObj.restVersion;

        if (callObj.reliesOnService) {
            var aggregatedErrors=[];
            var aggregatedResults=[];

            function ociMany (callObj, OracleConfig) {
                async.eachLimit(callObj.reliesOnService, 10,function(service, serviceCb) {
                    var records = callObj.collection[service][callObj.reliesOnCall[callObj.reliesOnService.indexOf(service)]][OracleConfig.region].data;

                    async.eachLimit(records, 10,function(record, recordCb) {
                        for (filter in callObj.filterKey){
                            if(callObj.filterConfig && callObj.filterConfig[filter]) {
                                parameters[callObj.filterKey[filter]] = OracleConfig[callObj.filterValue[filter]];
                            } else {
                                parameters[callObj.filterKey[filter]] = record[callObj.filterValue[filter]];
                            }
                        }

                        try {
                            OracleConfig.privateKey = sshpk.parsePrivateKey(OracleConfig.keyValue, 'pem');
                            assert.ok(sshpk.PrivateKey.isPrivateKey(OracleConfig.privateKey, [1, 2]),
                                'options.key must be a sshpk.PrivateKey');
                            (!OracleConfig.RESTversion ? OracleConfig.RESTversion = '/20160918' : false )
                        } catch (e) {
                            console.log('Could not read the Oracle Private Key.');
                        }

                        oci(callObj.api, oracleService, callKey, OracleConfig, parameters, function(result) {
                            if (result.code) {
                                aggregatedErrors.push(result);
                            }
                            //console.log('\n' + require('util').inspect(result, {depth: null}));
                            if (result &&
                                result.length &&
                                Object.prototype.toString.call(result) == "[object Array]") {
                                result.forEach(function(listItem){
                                    aggregatedResults.push(listItem);
                                });
                            } else if (Object.prototype.toString.call(result) == "[object Object]") {
                                aggregatedResults.push(result);
                            }

                            recordCb();
                        });
                    }, function(){
                        serviceCb();
                    });
                }, function() {
                    callback(aggregatedErrors, aggregatedResults);
                });
            }

            ociMany(callObj, OracleConfig);
        } else {
            for (filter in callObj.filterKey){
                if(callObj.filterLiteral && callObj.filterLiteral[filter]) {
                    parameters[callObj.filterKey[filter]] = callObj.filterValue[filter];
                } else {
                    parameters[callObj.filterKey[filter]] = OracleConfig[callObj.filterValue[filter]];
                }
            }

            try {
                OracleConfig.privateKey = sshpk.parsePrivateKey(OracleConfig.keyValue, 'pem');
                assert.ok(sshpk.PrivateKey.isPrivateKey(OracleConfig.privateKey, [1, 2]),
                    'options.key must be a sshpk.PrivateKey');
                (!OracleConfig.RESTversion ? OracleConfig.RESTversion = '/20160918' : false )
            } catch (e) {
                console.log('Could not read the Oracle Private Key.');
            }

            return oci(callObj.api, oracleService, callKey, OracleConfig, parameters, function(result) {
                if (result.code) {
                    return callback(result);
                }
                //console.log('\n' + require('util').inspect(result, {depth: null}));
                callback(null, result);
            });
        }
    }
}

var helpers = {
    regions: regions,
    OracleExecutor: OracleExecutor,
    MAX_REGIONS_AT_A_TIME: 6
};

for (s in shared) helpers[s] = shared[s];
for (f in functions) helpers[f] = functions[f];

module.exports = helpers;

/*
 * real-time-map-filter
 *
 * Copyright (c) 2019 Future Internet Consulting and Development Solutions S.L.
 * Apache License 2.0
 *
 */

/* globals MashupPlatform, moment, NGSI */

(function () {

    "use strict";

    /* *****************************************************************************/
    /* ******************************** PUBLIC *************************************/
    /* *****************************************************************************/

    let optionalID;

    const QuantumLeapSource = function QuantumLeapSource() {
        this.connection = null; // The connection to NGSI.
        this.refresh_interval = null;
        this.query_task = null;
        this.isFirstUpdate = true;
        this.handlerReceiveEntities = handlerReceiveEntities;
        this.setNewEntityID = setNewEntityID;
    };

    QuantumLeapSource.prototype.init = function init() {
        optionalID = null;
        // Set preference callbacks
        MashupPlatform.prefs.registerCallback(handlerPreferences.bind(this));

        // Set beforeunload listener
        window.addEventListener("beforeunload", () => {
            if (this.query_task != null) {
                this.query_task.abort(null, true);
                this.query_task = null;
            }

            if (this.subscriptionId == null) {
                return;
            }

            this.connection.v2.deleteSubscription(this.subscriptionId).then(
                () => {
                    MashupPlatform.operator.log("Subscription cancelled sucessfully", MashupPlatform.log.INFO);
                },
                () => {
                    MashupPlatform.operator.log("Error cancelling current context broker subscription");
                }
            );
        });

        // Set inputHandler
        MashupPlatform.wiring.registerCallback("entity_id", setNewEntityID.bind(this));

        // Set wiring status callback
        MashupPlatform.wiring.registerStatusCallback(() => {
            if (this.connection == null) {
                getInitialHistoricalInfo.call(this);
                doInitialSubscription.call(this);
            }
        });

        // Create NGSI conection
        getInitialHistoricalInfo.call(this);
        doInitialSubscription.call(this);

    };

    /* *****************************************************************************/
    /* ******************************** PRIVATE ************************************/
    /* *****************************************************************************/

    const setNewEntityID = function setNewEntityID(newId) {
        optionalID = newId;
        handlerPreferences.call(this);
    };

    let lastHistorical;

    const getInitialHistoricalInfo = function getInitialHistoricalInfo() {

        let entityID;
        if (optionalID != null) {
            entityID = optionalID;
        } else {
            entityID = MashupPlatform.prefs.get('entity_id');
        }
        if (entityID == "") {
            // EntityID is empty by the moment
            return;
        }

        let historical_server = MashupPlatform.prefs.get('historical_server');
        let fiwareService = MashupPlatform.prefs.get('ngsi_tenant');
        let ngsi_service_path = MashupPlatform.prefs.get('ngsi_service_path');
        let reqHeaders = {'FIWARE-ServicePath': ngsi_service_path};
        if (fiwareService !== "") {
            // If empty FIWARE-Service, the header should not be sent to QuantumLeap
            reqHeaders['FIWARE-Service'] =  fiwareService;
        }

        let numberOfDays4History = MashupPlatform.prefs.get('historical_length');

        let attrList = MashupPlatform.prefs.get('history_attributes');

        let historicLenght = numberOfDays4History * 60 * 60 * 1000; // 7 days default
        let toDate = moment().utc().valueOf();
        let fromDate = moment(toDate - historicLenght).valueOf();
        let url = new URL("/v2/entities/" + entityID, historical_server);

        // let start = moment();
        let successCB = function successCB(hSeries) {
            lastHistorical = hSeries.response.data;
            if (!MashupPlatform.prefs.get('update_real_time')) {
                MashupPlatform.wiring.pushEvent("historyOutput", lastHistorical);
            }
            // let end = moment();
            // MashupPlatform.operator.log("Getting History from QuantumLeap: " + end.diff(start, 'seconds') + " seconds", MashupPlatform.log.INFO);
        };

        let failureCB = function failureCB(e) {
            MashupPlatform.operator.log("Error getting Historical Data (" + e.status + "): " + JSON.stringify(e.response), MashupPlatform.log.ERROR);
        };

        MashupPlatform.http.makeRequest(url, {
            method: "GET",
            responseType: "json",
            parameters: {
                attrs: attrList,
                fromDate: fromDate,
                toDate: toDate
            },
            requestHeaders: reqHeaders,
            onSuccess: successCB,
            onFailure: failureCB
        });
    };

    const doInitialSubscription = function doInitialSubscription() {

        if (!MashupPlatform.prefs.get('update_real_time')) {
            return;
        }
        let id_pattern;
        if (optionalID != null) {
            id_pattern = optionalID;
        } else {
            id_pattern = MashupPlatform.prefs.get('entity_id').trim();
        }

        if (id_pattern == "") {
            // EntityID is empty by the moment
            return;
        }

        this.isFirstUpdate = true;
        this.subscriptionId = null;
        this.connection = null;

        if (!MashupPlatform.operator.outputs.historyOutput.connected) {
            return;
        }

        this.ngsi_server = MashupPlatform.prefs.get('ngsi_server');
        this.ngsi_proxy = MashupPlatform.prefs.get('ngsi_proxy');

        let request_headers = {};

        if (MashupPlatform.prefs.get('use_owner_credentials')) {
            request_headers['FIWARE-OAuth-Token'] = 'true';
            request_headers['FIWARE-OAuth-Header-Name'] = 'X-Auth-Token';
            request_headers['FIWARE-OAuth-Source'] = 'workspaceowner';
        }

        let tenant = MashupPlatform.prefs.get('ngsi_tenant').trim();
        if (tenant !== '') {
            request_headers['FIWARE-Service'] = tenant;
        }

        let path = MashupPlatform.prefs.get('ngsi_service_path').trim();
        if (path !== '' && path !== '/') {
            request_headers['FIWARE-ServicePath'] = path;
        }

        this.connection = new NGSI.Connection(this.ngsi_server, {
            use_user_fiware_token: MashupPlatform.prefs.get('use_user_fiware_token'),
            request_headers: request_headers,
            ngsi_proxy_url: this.ngsi_proxy
        });

        let notification = {
            attrsFormat: "normalized",
            callback: (notification) => {
                handlerReceiveEntities.call(this, notification.data);
            }
        };
        let attrs = MashupPlatform.prefs.get('history_attributes').trim();

        let condition = undefined;

        if (attrs !== "") {
            condition = {};
        }
        if (attrs !== "") {
            condition.attrs = attrs.split(new RegExp(',\\s*'));
            notification.attrs = attrs.split(new RegExp(',\\s*'));
            // Add by default dateModified and dateObserved
            notification.attrs.push("dateModified");
            notification.attrs.push("dateObserved");
        }

        if (attrs === "") {
            // TODO all attributes?
            // doInitialQueries.call(this, id_pattern, types, filter);
        } else {
            let entities = [{id: id_pattern}];

            this.connection.v2.createSubscription({
                description: "QuantumLeap source subscription",
                subject: {
                    entities: entities,
                    condition: condition
                },
                notification: notification,
                expires: moment().add('3', 'hours').toISOString()
            }).then(
                (response) => {
                    MashupPlatform.operator.log("Subscription created successfully (id: " + response.subscription.id + ")", MashupPlatform.log.INFO);
                    this.subscriptionId = response.subscription.id;
                    this.refresh_interval = setInterval(refreshNGSISubscription.bind(this), 1000 * 60 * 60 * 2);  // each 2 hours
                    // doInitialQueries.call(this, id_pattern, types, filter);
                },
                (e) => {
                    if (e instanceof NGSI.ProxyConnectionError) {
                        MashupPlatform.operator.log("Error connecting with the NGSI Proxy: " + e.cause.message);
                    } else {
                        MashupPlatform.operator.log("Error creating subscription in the context broker server: " + e.message);
                    }
                }
            );
        }
    };

    const refreshNGSISubscription = function refreshNGSISubscription() {
        if (this.subscriptionId) {
            this.connection.v2.updateSubscription({
                id: this.subscriptionId,
                expires: moment().add('3', 'hours').toISOString()
            }).then(
                () => {
                    MashupPlatform.operator.log("Subscription refreshed sucessfully", MashupPlatform.log.INFO);
                },
                () => {
                    MashupPlatform.operator.log("Error refreshing current context broker subscription");
                }
            );
        }
    };

    let interval = null;
    let pendingUpdates = [];
    const handlerReceiveEntities = function handlerReceiveEntities(elements) {
        // MashupPlatform.operator.log("New updated received: " + moment().format('LTS'), MashupPlatform.log.INFO);
        if (elements != null && Array.isArray(elements) && elements.length > 0) {
            pendingUpdates.push(elements[0]);
            if (lastHistorical == null) {
                // waiting for QL response
                return;
            }
            if (interval == null) {
                interval = setTimeout(function () {
                    // let start = moment();
                    try {
                        let need2PushEvent = false;
                        pendingUpdates.forEach(entity => {
                            // UpdateHistory if necessary
                            need2PushEvent = updateHistory.call(this, entity) || need2PushEvent;
                        });
                        // Clear pendingUpdates
                        pendingUpdates = [];
                        if (need2PushEvent) {
                            MashupPlatform.wiring.pushEvent("historyOutput", lastHistorical);
                        }
                        interval = null;
                        // let end = moment();
                        // MashupPlatform.operator.log("processing updates: " + end.diff(start, 'seconds') + " seconds", MashupPlatform.log.INFO);
                    } catch (e) {
                        MashupPlatform.operator.log("Error updating historical data using Context Broker notification");
                        pendingUpdates = [];
                        interval = null;
                        return;
                    }
                }.bind(this),200);
            }
        } else {
            MashupPlatform.operator.log("Error updating historical information. Received entities cannot be empty.");
        }
    };

    const updateHistory = function updateHistory(entity) {

        if (lastHistorical == null) {
            return false;
        }

        let isMetadataRequired = MashupPlatform.prefs.get('include_metadata');
        let dateModified;
        // Add new index
        if (entity.dateModified != null) {
            dateModified = entity.dateModified.value;
        } else if (entity.dateObserved != null) {
            dateModified = entity.dateObserved.value;
        } else {
            MashupPlatform.operator.log("The " + entity.id + " entity should contains dateModified or dateObserved" +
                " attribute: " + entity, MashupPlatform.log.WARN);
            return false
        }

        let lastDate = moment(lastHistorical.index[lastHistorical.index.length - 1] + "Z").valueOf();
        let firstDate = moment(lastHistorical.index[0] + "Z").valueOf();
        let numberOfDays4History = MashupPlatform.prefs.get('historical_length');
        let historicLenght = numberOfDays4History  * 60 * 60 * 1000;
        const toDate = moment().utc().valueOf();
        const fromDate = moment(toDate - historicLenght).valueOf();

        if (moment(dateModified).valueOf() > lastDate) {

            // remove out of range values
            if (fromDate > firstDate) {
                while (lastHistorical.index.length > 0 && moment(lastHistorical.index[0] + "Z") < moment(fromDate)) {
                    // let oldValues = lastHistorical.index[0] + " (";
                    // Discarding first date and values
                    lastHistorical.index.shift();
                    lastHistorical.attributes.forEach(hist => {
                        // oldValues += hist.values[0] + ",";
                        hist.values.shift();
                    });
                    // oldValues = oldValues.slice(0, -1) + ")";
                    // MashupPlatform.operator.log("Discarding out of range values: " + oldValues, MashupPlatform.log.INFO);
                }
            }

            // Add new values
            // Normalize dateModified
            // CB timestamps: 2019-10-15T16:00:00.00Z
            // QL timestamps: 2019-10-15T16:00:00.000
            lastHistorical.index.push(dateModified.slice(0, -1) + '0');
            lastHistorical.attributes.forEach(hist => {
                if (entity[hist.attrName] != null) {
                    hist.values.push(entity[hist.attrName].value);
                } else {
                    MashupPlatform.operator.log("Adding null value for " + hist.attrName + ". No value for this" +
                        " attribute was found in the context broker notification. It may have been removed from" +
                        " the entity.", MashupPlatform.log.WARN);
                    hist.values.push(null);
                }
                // Metadata
                if (entity[hist.attrName] != null && isMetadataRequired && entity[hist.attrName].metadata != null) {
                    hist.metadata = entity[hist.attrName].metadata;
                }
            });

            MashupPlatform.operator.log("Historical information updated: " + entity.id +
                " last value date: " + moment(lastDate).format() + "; new dateModified: " +
                moment(dateModified).format(), MashupPlatform.log.INFO);
            return true;
        } else {
            // Update metadata
            if (isMetadataRequired && this.isFirstUpdate) {
                this.isFirstUpdate = false;
                MashupPlatform.operator.log("Adding entity metadata with the first update: " + entity.id,
                    MashupPlatform.log.INFO);
                lastHistorical.attributes.forEach(hist => {
                    if (entity[hist.attrName] != null && entity[hist.attrName].metadata != null) {
                        hist.metadata = entity[hist.attrName].metadata;
                    } else {
                        MashupPlatform.operator.log("No metadata found for the attribute: " + hist.attrName,
                            MashupPlatform.log.WARN);
                    }
                });
                // Only metadata updated discard values from first notification after subscription
                return true;
            }

            // Trying to update chart with old information
            MashupPlatform.operator.log("Discarding entity values. Not updated values detected: " + entity.id +
                " last value date: " + moment(lastDate).format() + "; new dateModified: " +
                moment(dateModified).format(), MashupPlatform.log.INFO);
            return false;
        }
    };
    /* *************************** Preference Handler *****************************/

    const handlerPreferences = function handlerPreferences() {

        if (this.refresh_interval) {
            clearInterval(this.refresh_interval);
            this.refresh_interval = null;
        }

        if (this.subscriptionId != null) {
            this.connection.v2.deleteSubscription(this.subscriptionId).then(
                () => {
                    MashupPlatform.operator.log("Old subscription has been cancelled sucessfully", MashupPlatform.log.INFO);
                    getInitialHistoricalInfo.call(this);
                    doInitialSubscription.call(this);
                },
                () => {
                    MashupPlatform.operator.log("Error cancelling old subscription", MashupPlatform.log.WARN);
                    getInitialHistoricalInfo.call(this);
                    doInitialSubscription.call(this);
                }
            );
            // Remove subscriptionId without waiting to know if the operator finished successfully
            this.subscriptionId = null;
        } else {
            getInitialHistoricalInfo.call(this);
            doInitialSubscription.call(this);
        }
    };

    /* import-block */
    window.QuantumLeapSource = QuantumLeapSource;
    /* end-import-block */

    const qlSource = new QuantumLeapSource();
    window.addEventListener("DOMContentLoaded", qlSource.init.bind(qlSource), false);

})();

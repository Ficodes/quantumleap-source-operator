/*
 * quantumleap-source
 *
 * Copyright (c) 2018 Future Internet Consulting and Development Solutions S.L.
 * Apache License 2.0
 *
 */

/* globals MashupPlatform, MockMP, NGSI, beforeAll, beforeEach, QuantumLeapSource moment */

(function () {

    "use strict";

    describe("QuantumLeap Source operator should", function () {

        let operator, abort_mock, entity_pages, entity_page_i;

        const realMoment = moment;

        const entity_idMock = 'exampleEntityId:123';
        const entity_typeMock = 'exampleType';
        const todayMockValue = "2019-10-04T22:02:00.00Z";
        const historical_length = 24;

        const expected_historicalTo = realMoment(todayMockValue).utc().valueOf();
        const expected_historicalFrom = realMoment(todayMockValue).utc().subtract(historical_length, 'hour').valueOf();
        const attrListMockString = 'attr1, attr2';
        const attrListMock = ['attr1', 'attr2'];
        const historical_serverMock = 'https://quantumpleap.example.com';
        const ngsi_serverMock = 'https://orion.example.com';
        const ngsi_tenant = 'Tenant';
        const ngsi_service_pathMock = '/Spain/Madrid';

        const expectedQLRequest = {
            method: "GET",
            responseType: "json",
            parameters: {
                attrs: attrListMock,
                type: entity_typeMock,
                fromDate: expected_historicalFrom,
                toDate: expected_historicalTo,
                offset: 0
            },
            requestHeaders: {
                'FIWARE-ServicePath': ngsi_service_pathMock,
                'FIWARE-Service': ngsi_tenant
            }
        };

        const lastIndex = "2019-10-04T21:59:00.000";
        const lastIndexZ = "2019-10-04T21:59:00.00Z";

        const INITIAL_SERIE = {
            attributes: [
                {
                    attrName: "attr1",
                    values: [
                        0.359375,
                        0.369375,
                        0.379375,
                        0.389375,
                        0.399375,
                        0.409375,
                        0.419375,
                        0.429375,
                        0.439375,
                        0.449375
                    ]
                },
                {
                    attrName: "attr2",
                    values: [
                        0,
                        1,
                        1,
                        1,
                        0,
                        1,
                        1,
                        1,
                        0,
                        1
                    ]
                }
            ],
            entityId: entity_idMock,
            index: [
                "2019-10-03T22:00:00.000",
                "2019-10-03T22:56:10.000",
                "2019-10-04T15:00:11.000",
                "2019-10-04T15:03:13.000",
                "2019-10-04T15:05:11.000",
                "2019-10-04T15:10:11.000",
                "2019-10-04T15:15:10.000",
                "2019-10-04T15:20:10.000",
                "2019-10-04T15:25:10.000",
                "2019-10-04T15:26:26.000",
                lastIndex
            ]
        };

        const attr1Val = 5.69;
        const attr2Val = 94;
        const attr1Meta = {
            unit: {
                type: "Text",
                value: "m/s"
            }
        };
        const attr2Meta = {
            unit: {
                type: "Text",
                value: "º"
            }
        };
        const dateModifiedMock = "2019-10-04T22:05:00.00Z";

        const initial_update_after_subscription = [
            {
                dateModified: {
                    value: lastIndexZ,
                    type: "DateTime",
                    metadata: {}
                },
                id: entity_idMock,
                type: entity_typeMock,
                attr1: {
                    type: "Number",
                    value: 0.449375,
                    metadata: attr1Meta
                },
                attr2: {
                    type: "Number",
                    value: 1,
                    metadata: attr2Meta
                }
            }
        ];

        const update = [
            {
                dateModified: {
                    value: dateModifiedMock,
                    type: "DateTime",
                    metadata: {}
                },
                id: entity_idMock,
                type: entity_typeMock,
                attr1: {
                    type: "Number",
                    value: attr1Val,
                    metadata: attr1Meta
                },
                attr2: {
                    type: "Number",
                    value: attr2Val,
                    metadata: attr2Meta
                }
            }
        ];

        beforeAll(() => {
            window.MashupPlatform = new MockMP({
                type: 'operator',
                prefs: {
                    'historical_server': historical_serverMock,
                    'history_attributes': attrListMockString,
                    'entity_id': entity_idMock,
                    'entity_type': entity_typeMock,
                    'historical_length': historical_length,
                    'ngsi_proxy': 'https://ngsiproxy.example.com',
                    'ngsi_server': ngsi_serverMock,
                    'ngsi_tenant': ngsi_tenant,
                    'ngsi_service_path': ngsi_service_pathMock,
                    'use_owner_credentials': false,
                    'use_user_fiware_token': false,
                    'include_metadata': true,
                    'update_real_time': true,
                    'aggr_method': "",
                    'aggr_period': "",
                    'from': "",
                    'to': ""
                },
                inputs: ['entity_id'],
                outputs: ['historyOutput']
            });

            const url = new URL("/v2/entities/" + entity_idMock, historical_serverMock);
            window.MashupPlatform.http.addAnswer("Get", url, "200", "", () => {
                return {
                    response: JSON.parse(JSON.stringify(INITIAL_SERIE)),
                    status: 200
                }
            });
        });

        const resetMakeRequestMock = function resetMakeRequestMock() {
            window.MashupPlatform.http.makeRequest = jasmine.createSpy('qlRequest').and.returnValue(Promise.resolve({
                response: JSON.parse(JSON.stringify(INITIAL_SERIE)),
                status: 200
            }));
        };

        beforeEach(() => {
            // jasmine.clock().install();
            MashupPlatform.reset();
            MashupPlatform.resetData();
            operator = new QuantumLeapSource();
            abort_mock = jasmine.createSpy('abort');
            entity_pages = [{results: [], cout: 0}];
            entity_page_i = 0;
            window.NGSI = {
                Connection: jasmine.createSpy('NGSI').and.callFake(function () {
                    this.v2 = {
                        createSubscription: jasmine.createSpy('createSubscription').and.callFake(function () {
                            return Promise.resolve({subscription: {id: '5a291bb652c2f6bef3e02fd9'}});
                        }),
                        deleteSubscription: jasmine.createSpy('deleteSubscription').and.callFake(function () {
                            return Promise.resolve();
                        }),
                        listEntities: jasmine.createSpy('listEntities').and.callFake(function () {
                            const i = entity_page_i++;
                            if (entity_page_i === entity_pages.length) {
                                entity_page_i = 0;
                            }
                            const p = Promise.resolve(entity_pages[i]);
                            return {
                                then: function () {
                                    const result = p.then(arguments[0], arguments[1]);
                                    result.abort = abort_mock;
                                    return result;
                                }
                            };
                        })
                    };
                })
            };
            window.moment = jasmine.createSpy('moment').and.callFake(function (something) {
                if (something != null) {
                    return realMoment(something);
                } else {
                    return realMoment(todayMockValue);
                }
            });
            resetMakeRequestMock();

            spyOn(window, 'addEventListener');
        });

        afterEach(() => {
            // jasmine.clock().uninstall();
        });

        it("wait until the init method is called", function () {
            expect(operator.connection).toBe(null);
            expect(operator.refresh_interval).toBe(null);
            expect(operator.query_task).toBe(null);
        });

        it("does not try to connect on init if the output endpoint is not connected", () => {
            operator.init();

            expect(operator.connection).toEqual(null);
            expect(NGSI.Connection).not.toHaveBeenCalled();
        });

        it("connects on wiring change", () => {
            operator.init();

            expect(operator.connection).toEqual(null);
            MashupPlatform.operator.outputs.historyOutput.connect(true);
            MashupPlatform.wiring.registerStatusCallback.calls.mostRecent().args[0]();

            expect(operator.connection).not.toEqual(null);
        });

        it("connect on init", (done) => {
            MashupPlatform.operator.outputs.historyOutput.connect(true);

            operator.init();

            expect(operator.connection).not.toEqual(null);
            expect(NGSI.Connection).toHaveBeenCalledWith('https://orion.example.com', {
                ngsi_proxy_url: 'https://ngsiproxy.example.com',
                request_headers: {
                    'FIWARE-Service': 'Tenant',
                    'FIWARE-ServicePath': '/Spain/Madrid'
                },
                use_user_fiware_token: false
            });

            // First update from CB after subscription (should only take the metadata if required)
            operator.handlerReceiveEntities(initial_update_after_subscription);

            const expectedSerie = JSON.parse(JSON.stringify(INITIAL_SERIE));
            // Add metadata
            expectedSerie.attributes[0].metadata = attr1Meta;
            expectedSerie.attributes[1].metadata = attr2Meta;

            // Wait until it process the initial entities
            setTimeout(() => {
                expect(MashupPlatform.wiring.pushEvent).toHaveBeenCalledWith("historyOutput", expectedSerie);

                done();
            }, 201);
        });

        it("ignore wiring change events if already connected", () => {
            MashupPlatform.operator.outputs.historyOutput.connect(true);
            operator.init();

            const initial_connection = operator.connection;
            MashupPlatform.wiring.registerStatusCallback.calls.mostRecent().args[0]();

            expect(operator.connection).toBe(initial_connection);
        });

        it("connect (empty service)", () => {
            MashupPlatform.operator.outputs.historyOutput.connect(true);
            MashupPlatform.prefs.set('ngsi_tenant', '');

            operator.init();

            expect(operator.connection).not.toEqual(null);
            expect(NGSI.Connection).toHaveBeenCalledWith('https://orion.example.com', {
                ngsi_proxy_url: 'https://ngsiproxy.example.com',
                request_headers: {
                    'FIWARE-ServicePath': '/Spain/Madrid'
                },
                use_user_fiware_token: false
            });
        });

        it("connect (empty service path)", () => {
            MashupPlatform.operator.outputs.historyOutput.connect(true);
            MashupPlatform.prefs.set('ngsi_service_path', '');

            operator.init();

            expect(operator.connection).not.toEqual(null);
            expect(NGSI.Connection).toHaveBeenCalledWith('https://orion.example.com', {
                ngsi_proxy_url: 'https://ngsiproxy.example.com',
                request_headers: {
                    'FIWARE-Service': 'Tenant'
                },
                use_user_fiware_token: false
            });
        });

        it("updates ngsi connection on prefs change", () => {
            MashupPlatform.operator.outputs.historyOutput.connect(true);

            operator.init();
            const initial_connection = operator.connection;
            expect(initial_connection).not.toEqual(null);

            MashupPlatform.prefs.simulate({
                'ngsi_server': 'https://orion2.example.com',
            });

            expect(initial_connection.v2.deleteSubscription).not.toHaveBeenCalled();
            expect(operator.connection).not.toEqual(initial_connection);
            expect(NGSI.Connection).toHaveBeenCalledWith('https://orion2.example.com', {
                ngsi_proxy_url: 'https://ngsiproxy.example.com',
                request_headers: {
                    'FIWARE-Service': 'Tenant',
                    'FIWARE-ServicePath': '/Spain/Madrid'
                },
                use_user_fiware_token: false
            });
        });

        it("remove current subscription on prefs changes", (done) => {
            MashupPlatform.operator.outputs.historyOutput.connect(true);
            MashupPlatform.prefs.set('ngsi_update_attributes', 'location');

            operator.init();
            const initial_connection = operator.connection;
            expect(initial_connection).not.toEqual(null);

            // Wait until the subscription is created
            setTimeout(() => {
                expect(operator.subscriptionId).toEqual('5a291bb652c2f6bef3e02fd9');

                MashupPlatform.prefs.simulate({
                    'ngsi_server': 'https://orion2.example.com',
                });

                // Wait until subscription is deleted
                setTimeout(() => {
                    expect(initial_connection.v2.deleteSubscription).toHaveBeenCalled();
                    expect(operator.connection).not.toEqual(initial_connection);
                    expect(NGSI.Connection).toHaveBeenCalledWith('https://orion2.example.com', {
                        ngsi_proxy_url: 'https://ngsiproxy.example.com',
                        request_headers: {
                            'FIWARE-Service': 'Tenant',
                            'FIWARE-ServicePath': '/Spain/Madrid'
                        },
                        use_user_fiware_token: false
                    });

                    done();
                }, 0);
            }, 0);
        });

        it("cancel pending queries before unloading", () => {
            MashupPlatform.operator.outputs.historyOutput.connect(true);
            operator.init();
            const connection = operator.connection;

            // Call beforeunload listener
            window.addEventListener.calls.mostRecent().args[1]();
            expect(connection.v2.deleteSubscription).not.toHaveBeenCalled();
            expect(operator.query_task).toBe(null);
        });

        it("cancel subscriptions before unloading", (done) => {
            MashupPlatform.operator.outputs.historyOutput.connect(true);
            MashupPlatform.prefs.set('ngsi_update_attributes', 'location');
            operator.init();
            const connection = operator.connection;

            // Wait until subscription is created
            setTimeout(() => {
                expect(operator.subscriptionId).toBe("5a291bb652c2f6bef3e02fd9");

                // Call beforeunload listener
                window.addEventListener.calls.mostRecent().args[1]();
                expect(connection.v2.deleteSubscription).toHaveBeenCalled();
                expect(operator.query_task).toBe(null);

                done();
            });
        });

        it("push discard no changes notifications and out of range values", (done) => {
            MashupPlatform.operator.outputs.historyOutput.connect(true);
            window.removeEventListener("DOMContentLoaded",window.theInit, false);
            operator.init();

            const url = new URL("/v2/entities/" + entity_idMock, historical_serverMock);

            expect(MashupPlatform.http.makeRequest.calls.allArgs()[0][0].pathname).toEqual(url.pathname);
            expect(MashupPlatform.http.makeRequest.calls.allArgs()[0][1]).toEqual(jasmine.objectContaining(expectedQLRequest));

            expect(MashupPlatform.http.makeRequest).toHaveBeenCalledTimes(1);

            const expectedSerie = JSON.parse(JSON.stringify(INITIAL_SERIE));
            // Add metadata
            expectedSerie.attributes[0].metadata = attr1Meta;
            expectedSerie.attributes[1].metadata = attr2Meta;

            expect(MashupPlatform.wiring.pushEvent).not.toHaveBeenCalled();
            expect(MashupPlatform.operator.log).not.toHaveBeenCalled();

            setTimeout(() => {
                expect(operator.subscriptionId).toBe("5a291bb652c2f6bef3e02fd9");
                expect(MashupPlatform.operator.log).toHaveBeenCalledWith("Subscription created successfully " +
                    "(id: 5a291bb652c2f6bef3e02fd9)", MashupPlatform.log.INFO);
                expect(MashupPlatform.operator.log).toHaveBeenCalledTimes(1);
                expect(MashupPlatform.wiring.pushEvent).not.toHaveBeenCalled();

                MashupPlatform.reset();

                // First update from CB after subscription (should only take the metadata if required)
                operator.handlerReceiveEntities(initial_update_after_subscription);

                // Witing for first update
                setTimeout(() => {

                    expect(MashupPlatform.operator.log).toHaveBeenCalledWith("Adding entity metadata with the" +
                        " first update: " + entity_idMock, MashupPlatform.log.INFO);
                    expect(MashupPlatform.wiring.pushEvent).toHaveBeenCalledWith("historyOutput", expectedSerie);
                    expect(MashupPlatform.operator.log).toHaveBeenCalledTimes(1);
                    expect(MashupPlatform.wiring.pushEvent).toHaveBeenCalledTimes(1);

                    // Add updated values
                    expectedSerie.index.push(dateModifiedMock.slice(0, -1) + '0');
                    expectedSerie.attributes[0].values.push(attr1Val);
                    expectedSerie.attributes[1].values.push(attr2Val);
                    // Remove out-of-range values
                    expectedSerie.index.shift();
                    expectedSerie.attributes[0].values.shift();
                    expectedSerie.attributes[1].values.shift();

                    MashupPlatform.reset();
                    operator.handlerReceiveEntities(update);
                    // Duplicate update notification to check discards
                    operator.handlerReceiveEntities(update);
                    setTimeout(() => {
                        expect(MashupPlatform.operator.log).toHaveBeenCalledWith("Historical information updated: " +
                            entity_idMock + " last value date: " + realMoment(lastIndex + "Z").format() +
                            "; new dateModified: " + realMoment(dateModifiedMock).format(), MashupPlatform.log.INFO);

                        expect(MashupPlatform.operator.log).toHaveBeenCalledWith("Discarding entity values. Not updated" +
                            " values detected: " + entity_idMock + " last value date: " +
                            realMoment(dateModifiedMock).format() + "; new dateModified: " +
                            realMoment(dateModifiedMock).format(), MashupPlatform.log.INFO);
                        expect(MashupPlatform.operator.log).toHaveBeenCalledTimes(2);
                        expect(MashupPlatform.wiring.pushEvent).toHaveBeenCalledWith("historyOutput", expectedSerie);
                        expect(MashupPlatform.wiring.pushEvent).toHaveBeenCalledTimes(1);
                        done();
                    }, 201);
                }, 201);
            });
        });

        it("change entity", (done) => {
            MashupPlatform.operator.outputs.historyOutput.connect(true);

            // Add metadata
            const expectedSerie = JSON.parse(JSON.stringify(INITIAL_SERIE));
            expectedSerie.attributes[0].metadata = attr1Meta;
            expectedSerie.attributes[1].metadata = attr2Meta;

            operator.init();

            expect(operator.connection).not.toEqual(null);
            const url = new URL("/v2/entities/" + entity_idMock, historical_serverMock);
            expect(MashupPlatform.http.makeRequest.calls.allArgs()[0][0].pathname).toEqual(url.pathname);
            expect(MashupPlatform.http.makeRequest.calls.allArgs()[0][1]).toEqual(jasmine.objectContaining(expectedQLRequest));
            expect(MashupPlatform.operator.log).toHaveBeenCalledTimes(0);
            expect(MashupPlatform.wiring.pushEvent).toHaveBeenCalledTimes(0);
            expect(MashupPlatform.http.makeRequest).toHaveBeenCalledTimes(1);
            MashupPlatform.reset();

            // First update from CB after subscription (should only take the metadata if required)
            operator.handlerReceiveEntities(initial_update_after_subscription);

            // Wait until it process the initial entities
            setTimeout(() => {
                expect(MashupPlatform.wiring.pushEvent).toHaveBeenCalledWith("historyOutput", expectedSerie);

                expect(operator.subscriptionId).toBe("5a291bb652c2f6bef3e02fd9");
                expect(MashupPlatform.operator.log).toHaveBeenCalledWith("Subscription created successfully " +
                    "(id: 5a291bb652c2f6bef3e02fd9)", MashupPlatform.log.INFO);
                expect(MashupPlatform.operator.log).toHaveBeenCalledWith("Adding entity metadata with the" +
                    " first update: " + entity_idMock, MashupPlatform.log.INFO);
                expect(MashupPlatform.operator.log).toHaveBeenCalledTimes(2);
                expect(MashupPlatform.wiring.pushEvent).toHaveBeenCalledTimes(1);
                expect(MashupPlatform.http.makeRequest).toHaveBeenCalledTimes(0);

                MashupPlatform.reset();

                const newID = "OtherId";
                operator.setNewEntityID(newID);

                setTimeout(() => {
                    const url = new URL("/v2/entities/" + newID, historical_serverMock);
                    expect(MashupPlatform.http.makeRequest.calls.allArgs()[0][0].pathname).toEqual(url.pathname);
                    expect(MashupPlatform.http.makeRequest.calls.allArgs()[0][1]).toEqual(jasmine.objectContaining(expectedQLRequest));
                    expect(MashupPlatform.http.makeRequest).toHaveBeenCalledTimes(1);

                    expect(operator.subscriptionId).toBe("5a291bb652c2f6bef3e02fd9");
                    expect(MashupPlatform.operator.log).toHaveBeenCalledWith("Subscription created successfully " +
                        "(id: 5a291bb652c2f6bef3e02fd9)", MashupPlatform.log.INFO);

                    // Updated mock
                    expectedSerie.index.push(dateModifiedMock.slice(0, -1) + '0');
                    expectedSerie.attributes[0].values.push(attr1Val);
                    expectedSerie.attributes[1].values.push(666);
                    // Remove out-of-range values
                    expectedSerie.index.shift();
                    expectedSerie.attributes[0].values.shift();
                    expectedSerie.attributes[1].values.shift();

                    const update2 = JSON.parse(JSON.stringify(update));
                    // In fact is not necessary set the ID. does not check this ID after set the subscription
                    update2[0].id = newID;
                    update2[0].attr2.value = 666;
                    MashupPlatform.reset();
                    const initSub2 = JSON.parse(JSON.stringify(initial_update_after_subscription));
                    initSub2[0].id = newID;

                    // First update from CB after subscription (should only take the metadata if required)
                    operator.handlerReceiveEntities(initSub2);
                    operator.handlerReceiveEntities(update2);

                    // Witing for first update
                    setTimeout(() => {

                        expect(MashupPlatform.operator.log).toHaveBeenCalledWith("Adding entity metadata with the" +
                            " first update: " + newID, MashupPlatform.log.INFO);
                        expect(MashupPlatform.operator.log).toHaveBeenCalledWith("Historical information updated: " +
                            newID + " last value date: " + realMoment(lastIndex + "Z").format() +
                            "; new dateModified: " + realMoment(dateModifiedMock).format(), MashupPlatform.log.INFO);
                        expect(MashupPlatform.wiring.pushEvent).toHaveBeenCalledWith("historyOutput", expectedSerie);
                        expect(MashupPlatform.operator.log).toHaveBeenCalledTimes(2);
                        expect(MashupPlatform.wiring.pushEvent).toHaveBeenCalledTimes(1);
                        expect(MashupPlatform.http.makeRequest).toHaveBeenCalledTimes(0);

                        done();
                    }, 201);
                }, 201);
            }, 201);
        });
    });

})();

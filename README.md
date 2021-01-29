# QuantumLeap source operator

[![](https://nexus.lab.fiware.org/repository/raw/public/badges/chapters/visualization.svg)](https://www.fiware.org/developers/catalogue/)
![](https://img.shields.io/github/license/Ficodes/quantumleap-source-operator.svg)<br/>
[![Tests](https://github.com/Ficodes/quantumleap-source-operator/workflows/Tests/badge.svg)](https://github.com/Ficodes/quantumleap-source-operator/actions?query=workflow%3A%22Tests%22)
[![Coverage Status](https://coveralls.io/repos/github/Ficodes/quantumleap-source-operator/badge.svg?branch=develop)](https://coveralls.io/github/Ficodes/quantumleap-source-operator?branch=develop)

The QuantumLeap source operator is a [WireCloud operator](http://wirecloud.readthedocs.org/en/latest/) usable for adding
historical information from QuantumLeap and Context Broker sources to your dashboards in a simple way. 

Historical Information provided by [QuantumLeap server](https://quantumleap.readthedocs.io/en/latest/)

Subscriptions feature provided by the [Orion Context Broker](http://catalogue.fiware.org/enablers/publishsubscribe-context-broker-orion-context-broker).

## Build

Be sure to have installed [Node.js](http://node.js). For example, you can install it on Ubuntu and Debian running the
following commands:

```console
curl -sL https://deb.nodesource.com/setup | sudo bash -
sudo apt-get install nodejs
sudo apt-get install npm
```

Install other npm dependencies by running:

```console
npm install
```

For build the operator you need download grunt:

```console
sudo npm install -g grunt-cli
```

And now, you can use grunt:

```console
grunt
```

If everything goes well, you will find a wgt file in the `dist` folder.

## Documentation

Documentation about how to use this operator is available on the [User Guide](src/doc/userguide.md). Anyway, you can
find general information about how to use operators on the
[WireCloud's User Guide](https://wirecloud.readthedocs.io/en/stable/user_guide/) available on Read the Docs.

## Copyright and License

Copyright (c) 2019 Future Internet Consulting and Development Solutions.

Apache License 2.0

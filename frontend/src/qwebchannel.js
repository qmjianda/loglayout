"use strict";

var QWebChannelMessageTypes = {
    QtContext: 0,
    Handler: 1,
    InvokeMethod: 2,
    ConnectToSignal: 3,
    DisconnectFromSignal: 4,
    SetProperty: 5,
    Response: 6,
    Signal: 7,
    PropertyUpdate: 8,
    Init: 9,
    Idle: 10,
    Debug: 11,
    Error: 12
};

const QWebChannel = function (transport, initCallback) {
    if (typeof transport !== "object" || typeof transport.send !== "function") {
        console.error("The QWebChannel: provided transport is invalid.");
        return;
    }

    var channel = this;
    this.transport = transport;

    this.send = function (data) {
        if (typeof data !== "string") {
            data = JSON.stringify(data);
        }
        channel.transport.send(data);
    }

    this.transport.onmessage = function (message) {
        var data = message.data;
        if (typeof data === "string") {
            data = JSON.parse(data);
        }
        console.log("QWebChannel DEBUG: Rx message:", data.type, data);
        switch (data.type) {
            case QWebChannelMessageTypes.Signal:
                channel.handleSignal(data);
                break;
            case QWebChannelMessageTypes.Response:
                channel.handleResponse(data);
                break;
            case QWebChannelMessageTypes.PropertyUpdate:
                channel.handlePropertyUpdate(data);
                break;
            case QWebChannelMessageTypes.Init:
                console.log("QWebChannel: received Init message");
                channel.initObjects(data.data);
                break;
            default:
                console.error("invalid message type received: ", data.type, data);
                break;
        }
    }

    this.execCallbacks = {};
    this.execId = 0;
    this.exec = function (data, callback) {
        if (!callback) {
            channel.send(data);
            return;
        }
        var id = channel.execId++;
        channel.execCallbacks[id] = callback;
        data.id = id;
        channel.send(data);
    };

    this.handleResponse = function (data) {
        if (!data.hasOwnProperty("id")) {
            console.error("Invalid response received: ", data);
            return;
        }
        var callback = channel.execCallbacks[data.id];
        if (typeof callback === "function") {
            callback(data.data);
            delete channel.execCallbacks[data.id];
        }
    };

    this.handleSignal = function (data) {
        var objectName = data.object;
        if (channel.objects.hasOwnProperty(objectName)) {
            var object = channel.objects[objectName];
            var signalName = data.signal;
            if (object.signals.hasOwnProperty(signalName)) {
                object.signals[signalName].apply(object, data.args);
            }
        }
    };

    this.handlePropertyUpdate = function (data) {
        for (var i in data.signals) {
            var signal = data.signals[i];
            channel.handleSignal(signal);
        }
    };

    this.objects = {};

    this.initObjects = function (data) {
        for (var objectName in data) {
            var object = new QObject(objectName, data[objectName], channel);
            channel.objects[objectName] = object;
        }
        if (initCallback) {
            initCallback(channel);
        }
    };

    console.log("QWebChannel: sending Init request");
    this.send({ type: QWebChannelMessageTypes.Init });
};

function QObject(name, data, webChannel) {
    this.__id__ = name;
    this.signals = {};
    this.properties = {};
    this.methods = {};

    var object = this;

    for (var propertyName in data.properties) {
        this.properties[propertyName] = data.properties[propertyName];
    }

    for (var signalName in data.signals) {
        this.signals[signalName] = {
            connect: function (callback) {
                if (typeof callback !== "function") {
                    console.error("Signal.connect: provided callback is not a function.");
                    return;
                }
                webChannel.send({
                    type: QWebChannelMessageTypes.ConnectToSignal,
                    object: name,
                    signal: signalName
                });
                if (!object.signals[signalName]) {
                    object.signals[signalName] = [];
                }
                object.signals[signalName].push(callback);
            }
        };
    }

    for (var methodName in data.methods) {
        this[methodName] = function () {
            var args = [];
            var callback;
            for (var i = 0; i < arguments.length; ++i) {
                if (typeof arguments[i] === "function" && i === arguments.length - 1) {
                    callback = arguments[i];
                } else {
                    args.push(arguments[i]);
                }
            }
            webChannel.exec({
                type: QWebChannelMessageTypes.InvokeMethod,
                object: name,
                method: methodName,
                args: args
            }, callback);
        };
    }
}

export { QWebChannel };

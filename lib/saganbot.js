'use strict';

var util = require('util');
var path = require('path');
var fs = require('fs');
var SQLite = require('sqlite3').verbose();
var Bot = require('slackbots');

/**
 * Constructor function. It accepts a settings object which should contain the following keys:
 *      token : the API token of the bot (mandatory)
 *      name : the name of the bot (will default to "saganbot")
 *      dbPath : the path to access the database (will default to "data/vra.db")
 *
 * @param {object} settings
 * @constructor
 *
 */
var SaganBot = function Constructor(settings) {
    this.settings = settings;
    this.settings.name = this.settings.name || 'saganbot';
    this.dbPath = settings.dbPath || path.resolve(__dirname, '..', 'data', 'vra.db');

    this.user = null;
    this.db = null;
};

// inherits methods and properties from the Bot constructor
util.inherits(SaganBot, Bot);

/**
 * Run the bot
 * @public
 */
SaganBot.prototype.run = function () {
    SaganBot.super_.call(this, this.settings);

    this.on('start', this._onStart);
    this.on('message', this._onMessage);
};

/**
 * On Start callback, called when the bot connects to the Slack server and access the channel
 * @private
 */
SaganBot.prototype._onStart = function () {
    this._loadBotUser();
    this._connectDb();
    this._firstRunCheck();
};

/**
 * On message callback, called when a message (of any type) is detected with the real time messaging API
 * @param {object} message
 * @private
 */
SaganBot.prototype._onMessage = function (message) {
    if (this._isChatMessage(message) &&
        this._isChannelConversation(message) &&
        !this._isFromSaganBot(message) &&
        this._isMentioningvRA(message)
    ) {
        this._replyWithDescription(message);
    }
};

/**
 * Replies to a message with the description if present in the glossary
 * @param {object} originalMessage
 * @private
 */
SaganBot.prototype._replyWithDescription = function (originalMessage) {
    var self = this;
    var queryMessage = originalMessage.text.slice(4, originalMessage.text.length);
    self.db.all('SELECT DESCRIPTION,PREREQS FROM GLOSSARY WHERE TERM =?', +queryMessage, function (err, record) {
        if (err) {
            return console.error('DATABASE ERROR:', err);
        }
        var channel = self._getChannelById(originalMessage.channel);
        self.postMessageToChannel(channel.name, record.DESCRIPTION, {as_user: true});
        //self.postMessageToChannel(channel.name, record.PREREQS, {as_user: true});
    });
};

/**
 * Loads the user object representing the bot
 * @private
 */
SaganBot.prototype._loadBotUser = function () {
    var self = this;
    this.user = this.users.filter(function (user) {
        return user.name === self.name;
    })[0];
};

/**
 * Open connection to the db
 * @private
 */
SaganBot.prototype._connectDb = function () {
    if (!fs.existsSync(this.dbPath)) {
        console.error('Database path ' + '"' + this.dbPath + '" does not exists or it\'s not readable.');
        process.exit(1);
    }

    this.db = new SQLite.Database(this.dbPath);
};

/**
 * Check if the first time the bot is run. It's used to send a welcome message into the channel
 * @private
 */
SaganBot.prototype._firstRunCheck = function () {
    var self = this;
    self.db.get('SELECT VAL FROM INFO WHERE NAME = "lastrun" LIMIT 1', function (err, record) {
        if (err) {
            return console.error('DATABASE ERROR:', err);
        }

        var currentTime = (new Date()).toJSON();

        // this is a first run
        if (!record) {
            self._welcomeMessage();

            return self.db.run('INSERT INTO INFO VALUES("lastrun", ?)', currentTime);
        }

        // updates with new last running time
        self.db.run('UPDATE INFO SET VAL= ? WHERE NAME = "lastrun"', currentTime);
    });
};

/**
 * Sends a welcome message in the channel
 * @private
 */
SaganBot.prototype._welcomeMessage = function () {
    this.postMessageToChannel(this.channels[0].name, 'Hello there!' +
        '\n vRA can be a bummer for a first-time user. Just type a vRA-specific term you wish to invoke my glossary!',
        {as_user: true});
};

/**
 * Util function to check if a given real time message object represents a chat message
 * @param {object} message
 * @returns {boolean}
 * @private
 */
SaganBot.prototype._isChatMessage = function (message) {
    return message.type === 'message' && Boolean(message.text);
};

/**
 * Util function to check if a given real time message object is directed to a channel
 * @param {object} message
 * @returns {boolean}
 * @private
 */
SaganBot.prototype._isChannelConversation = function (message) {
    return typeof message.channel === 'string' &&
        message.channel[0] === 'C'
        ;
};

/**
 * Util function to check if a given real time message is mentioning vRA or the saganbot
 * @param {object} message
 * @returns {boolean}
 * @private
 */
SaganBot.prototype._isMentioningvRA = function (message) {
    return message.text.toLowerCase().indexOf('vra') > -1 ||
        message.text.toLowerCase().indexOf(this.name) > -1;
};

/**
 * Util function to check if a given real time message has ben sent by the saganbot
 * @param {object} message
 * @returns {boolean}
 * @private
 */
SaganBot.prototype._isFromSaganBot = function (message) {
    return message.user === this.user.id;
};

/**
 * Util function to get the name of a channel given its id
 * @param {string} channelId
 * @returns {Object}
 * @private
 */
SaganBot.prototype._getChannelById = function (channelId) {
    return this.channels.filter(function (item) {
        return item.id === channelId;
    })[0];
};

module.exports = SaganBot;

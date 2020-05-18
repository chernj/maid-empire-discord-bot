const Discord = require('discord.js');
const mongodb = require("mongodb");

const client = new Discord.Client();

client.on('ready', () => {
    console.log('I am ready!');
});

var db_client;
var toasts;
var reminders;
var user_settings;
var app_settings;

mongodb.MongoClient.connect(process.env.MONGODB_URI, function (err, database) {
    if (err) {
        console.log(err);
        process.exit(1);
    }
 
    db_client = database;
    toasts = database.collection('toasts');
    reminders = database.collection('reminders');
    user_settings = database.collection('user_settings');
    app_settings = database.collection('app_settings');
});

function handle_toast(message) {
    toasts.insert([{
        'content': message.content
    }], function(err, result) {
        if (err) {
            console.log(err);
            throw err;
        }
        if (result) {
            console.log(message.mentions.users.keyArray());
        }
    });
    toasts.count({}, function(e, entries_count) {
        if (e) throw e;
        console.log(entries_count);
    });
}

function get_channel_names(channel_ids) {
    channel_list = []
    for (channel_id in listen_toasts_channels) {
        var name = message.guild.channels.get(channel_id).name;
        channel_list.push(name);
    }
    return channel_list;
}

function describe(channels, empty_str, valid_str) {
    var output = [];
    if (!channels.length) {
        output.push(empty_str);
    } else {
        output.push(valid_str + ' ');
        if (channels.length > 2) {
            output.push(
                listens.slice(0, -2).join(', ')
            )
        }
        output.push(
            channels.slice(-2).join(', and ')
        )
    }
    return output.join('');
}

function setup(message) {
    let perms = message.member.permissions;
    let can_setup = perms.has('MANAGE_CHANNELS');
    if (can_setup) {
        app_settings.find({guild: message.guild.id}).toArray(function(err, result) {
            if (err) throw err;

            var listen_toasts_channels = [];
            var gloat_toasts_channels = [];
            var query_channels = [];
            for (entry in result) {
                if (entry.option === 'l') {
                    listen_toasts_channels.push(entry.channel_id);
                } else if (entry.option === 'g') {
                    gloat_toasts_channels.push(entry.channel_id);
                } else if (entry.option === 'q') {
                    query_channels.push(entry.channel_id);
                }
            }
            let listens = get_channel_names(listen_toasts_channels);
            let gloats = get_channel_names(gloat_toasts_channels);
            let queries = get_channel_names(query_channels);
            let listen_str = describe(
                listens,
                "I'm not listening for toasts in any channel.",
                "I'm listening for toasts in"
            )
            let gloat_str = describe(
                gloats,
                "I was told to not talk about accomplishments in any channel.",
                "I'm talking about successful accomplishments in"
            )
            let query_str = describe(
                queries,
                "Users can't query me in any channel.",
                "I can be queried for statistics in"
            )
            let status_message = [listen_str, gloat_str, query_str].join('\n');
            message.reply(status_message);
        });
    } else {
        message.reply(
            'Sorry, but you do not have the ability to manage channels! ' +
            'Please ask someone who can to set me up :3'
        )
    }
}

client.on('message', message => {
    if (message.content.startsWith('toast')) {
        // message.reply('pong');
        handle_toast(message);
    } else if (message.content.startsWith('setup')) {
        if (message.mentions.members.has(client.user.id)) {
            setup(message);
        }
        console.log("so trying to setup");
        console.log(message.mentions.members.keyArray(), client.user.id);
    }
});

client.login(process.env.BOT_TOKEN);

process.on('SIGTERM', function() {
    toasts.drop(function (err) {
        if (err) throw err;
    })
    client.destroy();
    db_client.close(function (err) {
        if (err) throw err;
    })
    process.exit(0);
});

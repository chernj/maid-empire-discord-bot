const Discord = require('discord.js');
const mongodb = require("mongodb");

const client = new Discord.Client();

client.on('ready', () => {
    console.log('Apologies for the delay, master');
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

function get_channel_names(channels, channel_ids) {
    var channel_list = [];
    var found = [];
    let chan_array = channels.array();
    let missing = [];
    for (chan_obj in chan_array) {
        console.log("Here attempt", Object.keys(chan_obj['0']));
        if (channel_ids.includes(chan_obj.id)) {
            channel_list.push(chan_obj.name);
            found.push(chan_obj.id);
        }
    }
    for (c_id in channel_ids) {
        if (!(c_id in found)) {
            missing.push(c_id);
        }
    }
    console.log("channel names are", channel_list);
    return [channel_list, missing];
}

function describe(channels, empty_str, valid_str) {
    var output = [];
    if (channels.length == 0) {
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

function remove_channel_setting(chosen_guild, chan_ids, option) {
    chan_ids.map(function(c_id, _) {
        let data = {
            guild: chosen_guild,
            option: option,
            channel_id: c_id
        }
        app_settings.deleteOne(data, function(err, result) {
            if (err) throw err;
        })
    });
}

function channel_management_str() {
    let help_str = [
        '- add toast-listening channels using "listen for toasts in", followed by channel mentions',
        '- add toast-bragging channels using "talk about toasts in", followed by channel mentions',
        '- add user queryable channels using "enable querying in", followed by channel mentions',
        '\nRemove channels by adding "don\'t" to the first 2 commands, or say "disable" instead of "enable".'
    ];
    return help_str.join('\n');
}

function invalid_perm_message(followup) {
    let base = 'Sorry, but you do not have the ability to manage channels.\n';
    return base + followup;
}

function can_touch_bot(message) {
    let perms = message.member.permissions;
    return perms.has('MANAGE_CHANNELS');
}

function setup(message) {
    let can_setup = can_touch_bot(message);
    if (can_setup) {
        app_settings.find({guild: message.guild.id}).toArray(function(err, result) {
            if (err) throw err;

            var listen_toasts_channels = [];
            var gloat_toasts_channels = [];
            var query_channels = [];
            console.log("setup results", result);
            result.map(function(entry, _) {
                if (entry.option == 'l') {
                    listen_toasts_channels.push(entry.channel_id);
                } else if (entry.option == 'g') {
                    gloat_toasts_channels.push(entry.channel_id);
                } else if (entry.option == 'q') {
                    query_channels.push(entry.channel_id);
                }
            })
            let chosen_guild = message.guild.id;
            let guild_chans = message.guild.channels;
            // console.log("I hate this", guild_chans.array());
            console.log("listening?", listen_toasts_channels);
            let [listens, rl] = get_channel_names(guild_chans, listen_toasts_channels);
            remove_channel_setting(chosen_guild, rl, 'l');
            let [gloats, rg] = get_channel_names(guild_chans, gloat_toasts_channels);
            remove_channel_setting(chosen_guild, rg, 'g');
            let [queries, rq] = get_channel_names(guild_chans, query_channels);
            remove_channel_setting(chosen_guild, rq, 'q');
            let listen_str = describe(
                listens,
                "\nI'm not listening for toasts in any channel.",
                "\nI'm listening for toasts in"
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
            let status_message = [
                listen_str, gloat_str, query_str, '',
                channel_management_str()].join('\n');
            message.reply(status_message);
        });
    } else {
        message.reply(
            invalid_perm_message('Please ask someone who can to set me up')
        )
    }
}

function channel_managing_content(message, content) {
    if (!can_touch_bot(message)) {
        message.reply(
            invalid_perm_message('Please allow someone who can to manage my settings')
        );
        return null;
    }
    let managing = false;
    let add = true;
    let option = '';
    if (content.startsWith('listen for toasts in')) {
        managing = true;
        option = 'l';
    } else if (content.startsWith('don\'t listen for toasts in')) {
        add = false;
        managing = true;
        option = 'l';
    } else if (content.startsWith('talk about toasts in')) {
        managing = true;
        option = 'g';
    } else if (content.startsWith('don\'t talk about toasts in')) {
        add = false;
        managing = true;
        option = 'g';
    } else if (content.startsWith('enable querying in')) {
        managing = true;
        option = 'q';
    } else if (content.startsWith('disable querying in')) {
        add = false;
        managing = true;
        option = 'q';
    }
    if (managing) {
        if (message.mentions.channels) {
            let channels = message.mentions.channels.keyArray();
            return [channels, option, add];
        }
    }
    return null;
}

function edit_app_settings(message, chan_ids, option, add_cmd) {
    let chosen_guild = message.guild.id;
    if (add_cmd) {
        let inserted = 0;
        let found = 0;
        chan_ids.map(function(c_id, index) {
            let search_data = {
                guild: chosen_guild,
                option: option,
                channel_id: c_id
            };
            // make sure none already exist
            app_settings.find(search_data).toArray(function(err, result) {
                if (err) throw err;
                if (!result.length) {
                    app_settings.insertOne(search_data, {}, function(err, result) {
                        if (err) throw err;
                        inserted += result.insertedCount;
                        if (index == chan_ids.length - 1) {
                            console.log("inserted", inserted, "already found", found);
                            setup(message);
                        }
                    })
                } else {
                    found += 1;
                    if (index == chan_ids.length - 1) {
                        console.log("inserted", inserted, "already found", found);
                        setup(message);
                    }
                }
            })
        })
        
    }
}

client.on('message', message => {
    let content = message.content.toLowerCase();
    if (content.startsWith('toast')) {
        // message.reply('pong');
        handle_toast(message);
    } else if (message.mentions.members.has(client.user.id)) {
        if (content.startsWith('setup')) {
            setup(message);
        }
        let mng_channels = channel_managing_content(message, content);
        if (mng_channels != null) {
            edit_app_settings(message, ...mng_channels);
        }
    }
});

client.login(process.env.BOT_TOKEN);

process.on('SIGTERM', function() {
    toasts.drop(function (err) {
        if (err) throw err;
    })
    app_settings.drop(function (err) {
        if (err) throw err;
    })
    client.destroy();
    db_client.close(function (err) {
        if (err) throw err;
    })
    process.exit(0);
});

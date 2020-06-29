const Discord = require('discord.js');
const mongodb = require("mongodb");

require('.messaging.js')();

const client = new Discord.Client();

client.on('ready', () => {
    console.log('Apologies for the delay, master');
});

var db_client;
var toasts;
var aggregate_toasts;
var reminders;
var user_settings;
var app_settings;  // contains settings for channels on servers, as well as last message checked
var locations = {};
var slated_for_deletion = {};  // ideally for deleting command messages
var last_checked_message = {};  // used for ensuring we don't miss recent toasts
var guild_channels = {};

var toast_interval;

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
    populate_settings();
    // check for toasts every 5 seconds
    toast_interval = setInterval(check_messages, 5000);
});

function record_toast_react(message, user_id) {
    // check to see if user already toasted. If not, record appropriately
    // TODO: Prevent self toast
    toasts.findOne({
        'msg': message.id,
        'u': user_id
    }, function(err, result) {
        if (err) throw err;
        if (!result) {
            // record toast
            toasts.insert([{
                'msg': message.id,
                'u': user_id
            }]);
            aggregate_toasts.updateOne(
                {'u': user_id},
                {$inc: {'c': 1} },
                {upsert: true}
            );
        }
    });
}

function record_toast_message(message) {
    // record message from direct toasting
    for (const user of message.mentions.users.values()) {
        record_toast_react(message, user.id);
    }
}

function populate_settings() {
    /*
    Populates the locations and last_checked_message dictionaries
    */
    locations = {};
    app_settings.find({}).toArray(function(err, result) {
        if (err) throw err;
        result.map(function(entry, _) {
            if (!(entry.guild in locations)) {
                locations[entry.guild] = {
                    'listening': [],
                    'gloating': [],
                    'querying': []
                }
            }
            if (entry.option == 'l') {
                locations[entry.guild]['listening'].push(entry.channel_id);
            } else if (entry.option == 'g') {
                locations[entry.guild]['gloating'].push(entry.channel_id);
            } else if (entry.option == 'q') {
                locations[entry.guild]['querying'].push(entry.channel_id);
            } else if (entry.option == 'm') {
                // fill in last_checked_message
                var msg_key = toString(entry.guild) + '.' + toString(entry.channel_id);
                last_checked_message[msg_key] = entry.message_id;
            }
        });
    });
}

function get_channel_names(channels, channel_ids) {
    var channel_list = [];
    var found = [];
    let missing = [];
    for (const chan_obj of channels.values()) {
        if (channel_ids.includes(String(chan_obj.id))) {
            channel_list.push('#' + chan_obj.name);
            found.push(chan_obj.id);
        }
    }
    for (c_id in channel_ids) {
        if (!(c_id in found)) {
            missing.push(c_id);
        }
    }
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
                channels.slice(0, -2).join(', ') + ', '
            )
        }
        output.push(
            channels.slice(-2).join(', and ')
        )
    }
    return output.join('');
}

function remove_channel_setting(chosen_guild, chan_ids, option, callback=null) {
    chan_ids.map(function(c_id, index) {
        let data = {
            guild: chosen_guild,
            option: option,
            channel_id: c_id
        }
        app_settings.deleteOne(data, function(err, result) {
            if (err) throw err;
            if (callback != null & index == chan_ids.length-1) {
                callback();
            }
        })
    });
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
            guild_channels[chosen_guild] = guild_chans;
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
                listen_str, gloat_str, query_str].join('\n');
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
    if (looking_for(content, 'listen for toasts in')) {
        managing = true;
        option = 'l';
    } else if (looking_for(content, 'don\'t listen for toasts in')) {
        add = false;
        managing = true;
        option = 'l';
    } else if (looking_for(content, 'talk about toasts in')) {
        managing = true;
        option = 'g';
    } else if (looking_for(content, 'don\'t talk about toasts in')) {
        add = false;
        managing = true;
        option = 'g';
    } else if (looking_for(content, 'enable querying in')) {
        managing = true;
        option = 'q';
    } else if (looking_for(content, 'disable querying in')) {
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
                            populate_settings();
                            setup(message);
                        }
                    })
                } else {
                    found += 1;
                    if (index == chan_ids.length - 1) {
                        console.log("inserted", inserted, "already found", found);
                        populate_settings();
                        setup(message);
                    }
                }
            })
        })
        
    } else {
        // delete a setting
        remove_channel_setting(chosen_guild, chan_ids, option, function() {
            console.log("deleted", chan_ids.length);
            populate_settings();
            setup(message);
        });
    }
}

function looking_for(content, phrase) {
    if (content.startsWith(phrase) | content.endsWith(phrase)) return true;
    return false;
}

client.on('message', message => {
    let content = message.content.toLowerCase();
    if (looking_for(content, 'toast')) {
        record_toast_message(message);
    } else if (message.mentions.members.has(client.user.id)) {
        if (looking_for(content, 'app settings')) {
            setup(message);
        }
        let mng_channels = channel_managing_content(message, content);
        if (mng_channels != null) {
            edit_app_settings(message, ...mng_channels);
        }
        if (looking_for(content, 'reminder help')) {
            message.reply(reminder_help_str());
        } else if (looking_for(content, 'help')) {
            message.reply(server_help_str(can_touch_bot(message)));
        } else if (looking_for(content, 'commands')) {
            if (can_touch_bot(message)) {
                message.reply(channel_management_str());
            } else {
                message.reply(invalid_perm_message('Please do not worry about these commands.'));
            }
        }
    }
});

function check_messages() {
    for (const guild_id in guild_channels) {
        let chans = guild_channels[guild_id];
        setTimeout(() => {
            explore_messages(guild_id, channels, channel_ids);
        }, 100);
    }
}

function explore_messages(guild_id, channels, channel_ids, limiter=100) {
    // pull up *limiter* messages in a channel, then check for toasts in any of them
    for (const chan_obj of channels.values()) {
        var c_id = String(chan_obj.id);
        if (channel_ids.includes(c_id)) {
            chan_obj.fetchMessages({limit: limiter}).then(function(messages) {
                gleam_messages_from_channel(guild_id, c_id, messages)
            }).catch(console.error);
        }
    }
}

function gleam_messages_from_channel(g_id, c_id, messages) {
    // checks for toast reactions and any missed toast messages
    var missed_toasts = [];
    var found_last_toast = false;
    var last_msg_key = toString(g_id) + '.' + toString(c_id);
    var last_id = last_checked_message[last_msg_key];
    var new_last = null;
    for (const msg of messages) {
        let content = msg.content.toLowerCase();
        if (!(found_last_toast) && looking_for(content, 'toast')) {
            if (msg.id == last_id) {
                found_last_toast = true;
            } else {
                missed_toasts.push(msg);
                if (new_last != null) new_last = msg.id;
            }
        }
        var user_ids = who_toast_reacted(msg);
        for (const u_id of user_ids) {
            record_toast_react(msg, u_id);
        }
    }
    for (const msg of missed_toasts) {
        record_toast_message(msg);
    }
    if (new_last) last_checked_message[last_msg_key] = new_last;
}

function who_toast_reacted(message) {
    var output = [];
    for (const rct of message.reactions.values()) {
        if (rct.name == 'beers') {
            rct.fetchUsers({limit: 1000}).then(function(usrs) {
                for (const usr of usrs) {
                    output.push(usr.id);
                }
            });
        }
    }
    return output;
}

client.login(process.env.BOT_TOKEN);

process.on('SIGTERM', function() {
    toasts.drop(function (err) {
        if (err) throw err;
    })
    client.destroy();
    db_client.close(function (err) {
        if (err) throw err;
    })
    clearInterval(toast_interval);
    process.exit(0);
});

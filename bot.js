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
var locations = {};

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

function populate_settings() {
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
            }
        });
        // sconsole.log(locations);
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

function channel_management_str() {
    let help_str = [
        '\nI only speak when spoken to. Mention me to use any command, including the ones below.\n',
        '`listen for toasts in` along with channel mentions allows me to listen for toasts in these channels.',
        '`talk about toasts in` again with channel mentions allows me to relay accomplishments in these channels.',
        '`enable querying in` plus channel mentions allows me respond to commands in designed channels.',
        '\n`don\'t` as a prefix before the first two commands deafen and mute me to any mentioned channels.',
        'Finally, using `disable` instead of `enable` reverses the querying command.'
    ];
    return help_str.join('\n');
}

function server_help_str(managing_perm) {
    let help_str = [
        '\nYou can configure how you interact with toasts, as well as set timed or ',
        'dynamic reminders to receive additional encouragement to achieve your goals.\n',
        'While mentioning me, say:\n',
        '`reminders?` to see what reminders are set for you\n',
        '`toasts?` along with an optional time specification to see toasts given to you going back ',
        'until the specified time.\n\tTime format is `NUMBER UNIT`, with valid units being week, day, ',
        'and hour.\n\tIf you\'d prefer to have these results messaged to you, preppend the command ',
        'with `DM`.\n',
        '`help` to see this menu again.'
    ];
    if (managing_perm) {
        help_str.push('\n\nAlso, configure me to your liking so I can better help others. While mentioning me, say:');
        help_str.push('\n`settings`, to understand how I\'m configured to help this server.');
        help_str.push('\n`commands`, to understand how to edit any server settings.')
    }
    return help_str.join('');
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
        handle_toast(message);
    } else if (message.mentions.members.has(client.user.id)) {
        if (looking_for(content, 'app settings')) {
            setup(message);
        }
        let mng_channels = channel_managing_content(message, content);
        if (mng_channels != null) {
            edit_app_settings(message, ...mng_channels);
        }
        if (looking_for(content, 'help')) {
            message.reply(server_help_str(can_touch_bot(message)));
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

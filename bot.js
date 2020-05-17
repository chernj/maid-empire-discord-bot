const Discord = require('discord.js');
const mongodb = require("mongodb");

const client = new Discord.Client();

client.on('ready', () => {
    console.log('I am ready!');
});

var db_client;
var db;

mongodb.MongoClient.connect(process.env.MONGODB_URI, function (err, database) {
    if (err) {
        console.log(err);
        process.exit(1);
    }
 
    db_client = database;
    db = database.collection('toasts');
});

client.on('message', message => {
    if (message.content.startsWith('toast')) {
       // message.reply('pong');
        db.insert([{
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
        db.count({}, function(e, entries_count) {
            if (e) throw e;
            console.log(entries_count);
        });
    }
});

client.login(process.env.BOT_TOKEN);

process.on('SIGTERM', function() {
    db.drop(function (err) {
        if (err) throw err;
    })
    client.destroy();
    db_client.close(function (err) {
        if (err) throw err;
    })
    process.exit(0);
});

module.exports = {
    channel_management_str: channel_management_str,
    server_help_str: server_help_str,
    reminder_help_str: reminder_help_str,
    invalid_perm_message: invalid_perm_message
}

var indent = '\t\t\t\t';

function channel_management_str() {
    let help_str = [
        '\nI only speak when spoken to. Mention me to use any command, including the ones below.\n',
        '`listen for toasts in` along with channel mentions allows me to listen for toasts in these channels.',
        '`talk about toasts in` again with channel mentions allows me to relay accomplishments in these channels.',
        '`enable querying in` plus channel mentions allows me respond to commands in designed channels.',
        '\n`don\'t` as a prefix before the first two commands deafen and mute me to any mentioned channels.',
        'Finally, using `disable` instead of `enable` reverses the querying command.\n',
        '`unbot`'
    ];
    return help_str.join('\n');
}

function server_help_str(managing_perm) {
    let help_str = [
        '\nYou can configure how you interact with toasts, as well as set timed or ',
        'dynamic reminders to receive additional encouragement to achieve your goals.\n',
        'While mentioning me, say:\n',
        '`reminders?` to see what reminders are set for you\n',
        '`reminder help` to see how to set reminders\n',
        '`toasts?` along with an optional time specification to see toasts given to you going back ',
        'until the specified time.\n', indent,
        'Time format is `NUMBER UNIT`, with valid units being month, week, ',
        'and day.\n', indent,
        'If you\'d prefer to have these results messaged to you, preppend the command ',
        'with `DM`.\n',
        '`help` to see this menu again.'
    ];
    if (managing_perm) {
        help_str.push('\n\nAlso, configure me to your liking so I can better help others. While mentioning me say:');
        help_str.push('\n`app settings` to understand how I\'m configured to help this server.');
        help_str.push('\n`commands` to understand how to edit any server settings.')
    }
    return help_str.join('');
}

function reminder_help_str() {
    let help_str = [
        'In any query-enabled channel, use any of the below commands while mentioning me.\n\n',
        '`tell me to` `MESSAGE WHEN TIME` sets a recurring notification at the given day and optional time.\n',
        indent, '`WHEN` is an order that starts with either\n', indent, indent,
        '`in`, or `every`\n', indent, 'followed by an optional number, then any combination of\n',
        indent, indent, '`Mo` `Tu` `We` `Th` `Fr` `Sa` `Su` `Day` `Workday` `Weekend`.\n', indent,
        'An optional Time command starts with `at` followed by one of\n', indent, indent,
        '`HH`, `HH:MM`, or `#CHANNEL NAME`. All times are in 24 hour format, and specifying a channel ',
        'name means to remind you after you message for the first time that day in the given channel.\n', indent,
        '`delete reminder NUMBER` deletes a reminder by index, found when asking for `reminders?`. Alternatively,\n',
        indent, '`undo` can be used immediately after creating a reminder to delete it'
    ];
    return help_str.join('');
}

function invalid_perm_message(followup) {
    let base = 'Sorry, but you do not have the ability to manage channels.\n';
    return base + followup;
}

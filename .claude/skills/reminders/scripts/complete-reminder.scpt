#!/usr/bin/osascript
-- complete-reminder.scpt
-- Marks a reminder as complete in Reminders.app
--
-- Usage:
--   osascript complete-reminder.scpt '{"id":"x-apple-reminder://..."}'
--
-- Required parameters:
--   id - Reminder ID to mark as complete
--
-- Output format:
-- {"success": true, "data": {"id": "...", "name": "...", "completed": true}, "error": null}

on run argv
    -- Check for arguments
    if (count of argv) < 1 then
        return "{\"success\": false, \"data\": null, \"error\": \"Missing required JSON argument. Usage: osascript complete-reminder.scpt '{\\\"id\\\":\\\"x-apple-reminder://...\\\"}'}\"}"
    end if

    set jsonInput to item 1 of argv

    try
        -- Extract parameters from JSON using JavaScript for Automation
        set escapedInput to my escapeForJS(jsonInput)

        set jsScript to "
            (function() {
                var input = \"" & escapedInput & "\";
                try {
                    var obj = JSON.parse(input);
                    return [
                        obj.id || ''
                    ];
                } catch (e) {
                    return ['ERROR:' + e.message];
                }
            })()
        "

        set parsedValues to run script jsScript in "JavaScript"

        -- Extract values from the returned list
        set reminderId to item 1 of parsedValues

        -- Check for JSON parse error
        if reminderId starts with "ERROR:" then
            set errMsg to text 7 thru -1 of reminderId
            return "{\"success\": false, \"data\": null, \"error\": \"Invalid JSON: " & my escapeJSONString(errMsg) & "\"}"
        end if

        -- Validate required fields
        if reminderId is "" then
            return "{\"success\": false, \"data\": null, \"error\": \"Missing required field: id\"}"
        end if

        tell application "Reminders"
            -- Find the reminder by ID across all lists
            set foundReminder to missing value
            set foundListName to ""
            set allLists to lists

            repeat with reminderListObj in allLists
                set listName to name of reminderListObj
                set allReminders to reminders of reminderListObj

                repeat with rem in allReminders
                    set remId to id of rem
                    if remId is reminderId then
                        set foundReminder to rem
                        set foundListName to listName
                        exit repeat
                    end if
                end repeat

                if foundReminder is not missing value then
                    exit repeat
                end if
            end repeat

            -- Check if reminder was found
            if foundReminder is missing value then
                return "{\"success\": false, \"data\": null, \"error\": \"No reminder found with id: " & my escapeJSONString(reminderId) & "\"}"
            end if

            -- Mark the reminder as complete
            set completed of foundReminder to true

            -- Get reminder details for response
            set reminderName to name of foundReminder

            -- Build success response
            set resultJSON to "{\"success\": true, \"data\": {\"id\": \"" & my escapeJSONString(reminderId) & "\", \"name\": \"" & my escapeJSONString(reminderName) & "\", \"completed\": true}, \"error\": null}"

            return resultJSON
        end tell

    on error errMsg number errNum
        -- Return error JSON on failure
        set escapedError to my escapeJSONString(errMsg)
        return "{\"success\": false, \"data\": null, \"error\": \"" & escapedError & " (error " & errNum & ")\"}"
    end try
end run

on escapeJSONString(theString)
    -- Handle missing value
    if theString is missing value then
        return ""
    end if

    -- Escape special characters for JSON string
    set escapedString to theString as text
    set escapedString to my replaceText(escapedString, "\\", "\\\\")
    set escapedString to my replaceText(escapedString, "\"", "\\\"")
    set escapedString to my replaceText(escapedString, return, "\\n")
    set escapedString to my replaceText(escapedString, linefeed, "\\n")
    set escapedString to my replaceText(escapedString, tab, "\\t")
    return escapedString
end escapeJSONString

on replaceText(theText, searchStr, replaceStr)
    set AppleScript's text item delimiters to searchStr
    set textItems to text items of theText
    set AppleScript's text item delimiters to replaceStr
    set resultText to textItems as text
    set AppleScript's text item delimiters to ""
    return resultText
end replaceText

on escapeForJS(theString)
    -- Escape string for embedding in JavaScript double-quoted string
    set escapedString to theString
    -- Escape backslashes first (\ -> \\)
    set escapedString to my replaceText(escapedString, "\\", "\\\\")
    -- Escape double quotes (" -> \")
    set escapedString to my replaceText(escapedString, "\"", "\\\"")
    -- Escape newlines
    set escapedString to my replaceText(escapedString, return, "\\n")
    set escapedString to my replaceText(escapedString, linefeed, "\\n")
    return escapedString
end escapeForJS

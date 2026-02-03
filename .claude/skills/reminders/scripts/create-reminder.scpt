#!/usr/bin/osascript
-- create-reminder.scpt
-- Creates a new reminder in Reminders.app
--
-- Usage:
--   osascript create-reminder.scpt '{"name":"Buy groceries"}'
--   osascript create-reminder.scpt '{"name":"Buy groceries","body":"Milk, bread, eggs"}'
--   osascript create-reminder.scpt '{"name":"Meeting prep","dueDate":"2026-02-02T10:00:00","priority":1}'
--   osascript create-reminder.scpt '{"name":"Task","list":"Work"}'
--
-- Required parameters:
--   name     - Reminder title (required)
--
-- Optional parameters:
--   body     - Notes/description
--   dueDate  - ISO 8601 date string (YYYY-MM-DDTHH:MM:SS)
--   priority - 0=none (default), 1=high, 5=medium, 9=low
--   list     - Target list name (defaults to first list)
--
-- Output format:
-- {"success": true, "data": {"id": "reminder-id", "name": "Reminder title"}, "error": null}

on run argv
    -- Check for arguments
    if (count of argv) < 1 then
        return "{\"success\": false, \"data\": null, \"error\": \"Missing required JSON argument. Usage: osascript create-reminder.scpt '{\\\"name\\\":\\\"Buy groceries\\\"}'}\"}"
    end if

    set jsonInput to item 1 of argv

    try
        -- Extract parameters from JSON using JavaScript for Automation
        -- We need to escape the input for JavaScript string literal
        set escapedInput to my escapeForJS(jsonInput)

        set jsScript to "
            (function() {
                var input = \"" & escapedInput & "\";
                try {
                    var obj = JSON.parse(input);
                    // Return as array: [name, body, dueDate, priority, list]
                    return [
                        obj.name || '',
                        obj.body || '',
                        obj.dueDate || '',
                        obj.priority !== undefined ? String(obj.priority) : '0',
                        obj.list || ''
                    ];
                } catch (e) {
                    return ['ERROR', e.message, '', '', ''];
                }
            })()
        "

        set parsedValues to run script jsScript in "JavaScript"

        -- Extract values from the returned list
        set reminderName to item 1 of parsedValues
        set reminderBody to item 2 of parsedValues
        set reminderDueDate to item 3 of parsedValues
        set reminderPriorityStr to item 4 of parsedValues
        set reminderList to item 5 of parsedValues

        -- Check for JSON parse error
        if reminderName is "ERROR" then
            return "{\"success\": false, \"data\": null, \"error\": \"Invalid JSON: " & my escapeJSONString(reminderBody) & "\"}"
        end if

        -- Validate required fields
        if reminderName is "" then
            return "{\"success\": false, \"data\": null, \"error\": \"Missing required field: name\"}"
        end if

        -- Parse priority as integer
        set reminderPriority to reminderPriorityStr as integer

        tell application "Reminders"
            -- Find target list
            set targetList to missing value

            if reminderList is not "" then
                -- Try to find the specified list
                try
                    set targetList to list reminderList
                on error
                    -- List not found
                    return "{\"success\": false, \"data\": null, \"error\": \"List not found: " & my escapeJSONString(reminderList) & "\"}"
                end try
            else
                -- Use first list
                set allLists to lists
                if (count of allLists) > 0 then
                    set targetList to item 1 of allLists
                else
                    return "{\"success\": false, \"data\": null, \"error\": \"No reminder lists found\"}"
                end if
            end if

            -- Build reminder properties
            set reminderProps to {name:reminderName}

            -- Create the reminder
            set newReminder to make new reminder at end of reminders of targetList with properties reminderProps

            -- Set optional properties after creation
            if reminderBody is not "" then
                set body of newReminder to reminderBody
            end if

            if reminderDueDate is not "" then
                set parsedDate to my parseISODateTime(reminderDueDate)
                set due date of newReminder to parsedDate
            end if

            if reminderPriority is not 0 then
                set priority of newReminder to reminderPriority
            end if

            -- Get the ID of the created reminder
            set reminderId to id of newReminder

            -- Build success response
            set resultJSON to "{\"success\": true, \"data\": {\"id\": \"" & my escapeJSONString(reminderId) & "\", \"name\": \"" & my escapeJSONString(reminderName) & "\"}, \"error\": null}"

            return resultJSON
        end tell

    on error errMsg number errNum
        -- Return error JSON on failure
        set escapedError to my escapeJSONString(errMsg)
        return "{\"success\": false, \"data\": null, \"error\": \"" & escapedError & " (error " & errNum & ")\"}"
    end try
end run

on parseISODateTime(dateStr)
    -- Parse ISO 8601 date string (YYYY-MM-DDTHH:MM:SS or YYYY-MM-DD)
    set theDate to current date

    -- Check if it's just a date or date+time
    if dateStr contains "T" then
        -- Full datetime: YYYY-MM-DDTHH:MM:SS
        set AppleScript's text item delimiters to "T"
        set dateTimeParts to text items of dateStr
        set datePart to item 1 of dateTimeParts
        set timePart to item 2 of dateTimeParts
        set AppleScript's text item delimiters to ""

        -- Parse date
        set AppleScript's text item delimiters to "-"
        set dateParts to text items of datePart
        set AppleScript's text item delimiters to ""

        set theYear to item 1 of dateParts as integer
        set theMonth to item 2 of dateParts as integer
        set theDay to item 3 of dateParts as integer

        -- Parse time (handle optional seconds)
        set AppleScript's text item delimiters to ":"
        set timeParts to text items of timePart
        set AppleScript's text item delimiters to ""

        set theHours to item 1 of timeParts as integer
        set theMinutes to item 2 of timeParts as integer
        if (count of timeParts) >= 3 then
            -- Remove any trailing Z or timezone info from seconds
            set secStr to item 3 of timeParts
            if secStr contains "Z" then
                set AppleScript's text item delimiters to "Z"
                set secStr to item 1 of text items of secStr
                set AppleScript's text item delimiters to ""
            end if
            if secStr contains "+" then
                set AppleScript's text item delimiters to "+"
                set secStr to item 1 of text items of secStr
                set AppleScript's text item delimiters to ""
            end if
            set theSeconds to secStr as integer
        else
            set theSeconds to 0
        end if

        -- Build the date
        set year of theDate to theYear
        set month of theDate to theMonth
        set day of theDate to theDay
        set hours of theDate to theHours
        set minutes of theDate to theMinutes
        set seconds of theDate to theSeconds
    else
        -- Date only: YYYY-MM-DD
        set AppleScript's text item delimiters to "-"
        set dateParts to text items of dateStr
        set AppleScript's text item delimiters to ""

        set theYear to item 1 of dateParts as integer
        set theMonth to item 2 of dateParts as integer
        set theDay to item 3 of dateParts as integer

        set year of theDate to theYear
        set month of theDate to theMonth
        set day of theDate to theDay
        set time of theDate to 0
    end if

    return theDate
end parseISODateTime

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
    -- The JSON input already has escaped backslashes and quotes, we just need to
    -- escape them again for the JavaScript string literal
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

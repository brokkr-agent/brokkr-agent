#!/usr/bin/osascript
-- modify-reminder.scpt
-- Modifies a reminder property in Reminders.app
--
-- Usage:
--   osascript modify-reminder.scpt <reminder-id> <property> <new-value>
--   osascript modify-reminder.scpt "x-apple-reminder://..." "name" "New Title"
--   osascript modify-reminder.scpt "x-apple-reminder://..." "body" "New notes"
--   osascript modify-reminder.scpt "x-apple-reminder://..." "priority" "1"
--   osascript modify-reminder.scpt "x-apple-reminder://..." "due-date" "2026-02-15T10:00:00"
--
-- Arguments:
--   1. reminder-id - Reminder ID to modify
--   2. property    - Property to modify: name, body, priority, due-date
--   3. new-value   - New value for the property
--
-- Output format:
-- {"success": true, "data": {"id": "...", "name": "...", ...}, "error": null}

on run argv
    -- Check for arguments
    if (count of argv) < 3 then
        return "{\"success\": false, \"data\": null, \"error\": \"Usage: modify-reminder.scpt <reminder-id> <property> <new-value>\"}"
    end if

    set reminderId to item 1 of argv
    set propertyName to item 2 of argv
    set newValue to item 3 of argv

    try
        -- Validate required fields
        if reminderId is "" then
            return "{\"success\": false, \"data\": null, \"error\": \"Missing required argument: reminder-id\"}"
        end if

        if propertyName is "" then
            return "{\"success\": false, \"data\": null, \"error\": \"Missing required argument: property\"}"
        end if

        if newValue is "" then
            return "{\"success\": false, \"data\": null, \"error\": \"Missing required argument: new-value\"}"
        end if

        -- Validate property name
        if propertyName is not in {"name", "body", "priority", "due-date"} then
            return "{\"success\": false, \"data\": null, \"error\": \"Invalid property: " & my escapeJSONString(propertyName) & ". Valid properties: name, body, priority, due-date\"}"
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
                return "{\"success\": false, \"data\": null, \"error\": \"Reminder not found with id: " & my escapeJSONString(reminderId) & "\"}"
            end if

            -- Modify the property based on propertyName
            if propertyName is "name" then
                set name of foundReminder to newValue
            else if propertyName is "body" then
                set body of foundReminder to newValue
            else if propertyName is "priority" then
                set priority of foundReminder to (newValue as integer)
            else if propertyName is "due-date" then
                set parsedDate to my parseISODateTime(newValue)
                set due date of foundReminder to parsedDate
            end if

            -- Get updated reminder details
            set reminderName to name of foundReminder
            set isCompleted to completed of foundReminder
            set remBody to ""
            set remDueDate to ""
            set remPriority to 0

            try
                set remBody to body of foundReminder
                if remBody is missing value then
                    set remBody to ""
                end if
            end try

            try
                set remDueDateVal to due date of foundReminder
                if remDueDateVal is not missing value then
                    set remDueDate to remDueDateVal as text
                end if
            end try

            try
                set remPriority to priority of foundReminder
            end try

            -- Build success response with updated reminder data
            set resultJSON to "{\"success\": true, \"data\": {"
            set resultJSON to resultJSON & "\"id\": \"" & my escapeJSONString(reminderId) & "\", "
            set resultJSON to resultJSON & "\"name\": \"" & my escapeJSONString(reminderName) & "\", "
            set resultJSON to resultJSON & "\"completed\": " & (isCompleted as text) & ", "
            set resultJSON to resultJSON & "\"body\": \"" & my escapeJSONString(remBody) & "\", "
            set resultJSON to resultJSON & "\"dueDate\": \"" & my escapeJSONString(remDueDate) & "\", "
            set resultJSON to resultJSON & "\"priority\": " & remPriority & ", "
            set resultJSON to resultJSON & "\"list\": \"" & my escapeJSONString(foundListName) & "\""
            set resultJSON to resultJSON & "}, \"error\": null}"

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

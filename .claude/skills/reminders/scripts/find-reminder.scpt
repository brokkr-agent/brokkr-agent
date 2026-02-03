#!/usr/bin/osascript
-- find-reminder.scpt
-- Finds reminders by id or name pattern from Reminders.app
--
-- Usage:
--   osascript find-reminder.scpt '{"id":"x-apple-reminder://..."}'
--   osascript find-reminder.scpt '{"name":"groceries"}'
--   osascript find-reminder.scpt '{"name":"task","list":"Work"}'
--
-- Required parameters (at least one):
--   id   - Exact match on reminder id (takes precedence if both provided)
--   name - Case-insensitive partial match on reminder name
--
-- Optional parameters:
--   list - Filter results by list name
--
-- Output format:
-- {"success": true, "data": [{id, name, body, completed, dueDate, priority, listName}, ...], "error": null}

on run argv
    -- Check for arguments
    if (count of argv) < 1 then
        return "{\"success\": false, \"data\": [], \"error\": \"Missing required JSON argument. Usage: osascript find-reminder.scpt '{\\\"name\\\":\\\"search term\\\"}'}\"}"
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
                        obj.id || '',
                        obj.name || '',
                        obj.list || ''
                    ];
                } catch (e) {
                    return ['ERROR', e.message, ''];
                }
            })()
        "

        set parsedValues to run script jsScript in "JavaScript"

        -- Extract values from the returned list
        set searchId to item 1 of parsedValues
        set searchName to item 2 of parsedValues
        set filterList to item 3 of parsedValues

        -- Check for JSON parse error
        if searchId is "ERROR" then
            return "{\"success\": false, \"data\": [], \"error\": \"Invalid JSON: " & my escapeJSONString(searchName) & "\"}"
        end if

        -- Validate that at least one search parameter is provided
        if searchId is "" and searchName is "" then
            return "{\"success\": false, \"data\": [], \"error\": \"At least one of id or name is required\"}"
        end if

        -- Prepare lowercase search name for case-insensitive matching
        set lowerSearchName to my toLowerCase(searchName)

        tell application "Reminders"
            set reminderList to {}
            set allLists to lists

            repeat with reminderListObj in allLists
                set listName to name of reminderListObj

                -- If list filter is specified, skip non-matching lists
                if filterList is not "" and listName is not filterList then
                    -- Skip this list
                else
                    set allReminders to reminders of reminderListObj

                    repeat with rem in allReminders
                        set remId to id of rem
                        set remName to name of rem
                        set foundMatch to false

                        -- Search by ID (exact match, takes precedence)
                        if searchId is not "" then
                            if remId is searchId then
                                set foundMatch to true
                            end if
                        else
                            -- Search by name (case-insensitive partial match)
                            set lowerRemName to my toLowerCase(remName)
                            if lowerRemName contains lowerSearchName then
                                set foundMatch to true
                            end if
                        end if

                        if foundMatch then
                            -- Get optional body property safely
                            try
                                set remBody to body of rem
                                if remBody is missing value then set remBody to ""
                            on error
                                set remBody to ""
                            end try

                            set remCompleted to completed of rem

                            -- Get due date safely
                            try
                                set remDueDate to due date of rem
                                if remDueDate is missing value then
                                    set dueDateStr to "null"
                                else
                                    set dueDateStr to "\"" & my formatISODate(remDueDate) & "\""
                                end if
                            on error
                                set dueDateStr to "null"
                            end try

                            -- Get priority (0=none, 1=high, 5=medium, 9=low)
                            try
                                set remPriority to priority of rem
                            on error
                                set remPriority to 0
                            end try

                            -- Build JSON object for this reminder
                            set remJSON to "{\"id\": \"" & my escapeJSONString(remId) & "\""
                            set remJSON to remJSON & ", \"name\": \"" & my escapeJSONString(remName) & "\""
                            set remJSON to remJSON & ", \"body\": \"" & my escapeJSONString(remBody) & "\""

                            if remCompleted then
                                set remJSON to remJSON & ", \"completed\": true"
                            else
                                set remJSON to remJSON & ", \"completed\": false"
                            end if

                            set remJSON to remJSON & ", \"dueDate\": " & dueDateStr
                            set remJSON to remJSON & ", \"priority\": " & (remPriority as text)
                            set remJSON to remJSON & ", \"listName\": \"" & my escapeJSONString(listName) & "\"}"

                            set end of reminderList to remJSON

                            -- If searching by ID, we found the exact match, can exit early
                            if searchId is not "" then
                                exit repeat
                            end if
                        end if
                    end repeat

                    -- If searching by ID and we found it, exit the outer loop too
                    if searchId is not "" and (count of reminderList) > 0 then
                        exit repeat
                    end if
                end if
            end repeat

            -- Join reminder objects with commas
            set AppleScript's text item delimiters to ", "
            set remindersJSON to reminderList as text
            set AppleScript's text item delimiters to ""

            -- Build final response
            set resultJSON to "{\"success\": true, \"data\": [" & remindersJSON & "], \"error\": null}"

            return resultJSON
        end tell

    on error errMsg number errNum
        -- Return error JSON on failure
        set escapedError to my escapeJSONString(errMsg)
        return "{\"success\": false, \"data\": [], \"error\": \"" & escapedError & " (error " & errNum & ")\"}"
    end try
end run

on toLowerCase(theText)
    set lowercaseChars to "abcdefghijklmnopqrstuvwxyz"
    set uppercaseChars to "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    set resultText to ""

    repeat with i from 1 to length of theText
        set thisChar to character i of theText
        set charOffset to offset of thisChar in uppercaseChars
        if charOffset > 0 then
            set resultText to resultText & character charOffset of lowercaseChars
        else
            set resultText to resultText & thisChar
        end if
    end repeat

    return resultText
end toLowerCase

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

on formatISODate(theDate)
    -- Format AppleScript date as ISO 8601 (YYYY-MM-DDTHH:MM:SS)
    set theYear to year of theDate as integer
    set theMonth to month of theDate as integer
    set theDay to day of theDate as integer
    set theHours to hours of theDate as integer
    set theMinutes to minutes of theDate as integer
    set theSeconds to seconds of theDate as integer

    -- Pad with zeros
    set monthStr to my padZero(theMonth)
    set dayStr to my padZero(theDay)
    set hourStr to my padZero(theHours)
    set minStr to my padZero(theMinutes)
    set secStr to my padZero(theSeconds)

    return (theYear as text) & "-" & monthStr & "-" & dayStr & "T" & hourStr & ":" & minStr & ":" & secStr
end formatISODate

on padZero(num)
    if num < 10 then
        return "0" & (num as text)
    else
        return num as text
    end if
end padZero

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

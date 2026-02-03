#!/usr/bin/osascript
-- list-lists.scpt
-- Lists all reminder lists from Reminders.app and returns JSON output
--
-- Output format:
-- {"success": true, "data": [{name, id}, ...], "error": null}

on escapeJSONString(theString)
    -- Escape special characters for JSON string
    set escapedString to theString
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

try
    tell application "Reminders"
        set listData to {}
        set allLists to lists

        repeat with reminderList in allLists
            set listName to name of reminderList
            set listId to id of reminderList

            -- Build JSON object for this list
            set listJSON to "{\"name\": \"" & my escapeJSONString(listName) & "\", \"id\": \"" & my escapeJSONString(listId) & "\"}"

            set end of listData to listJSON
        end repeat

        -- Join list objects with commas
        set AppleScript's text item delimiters to ", "
        set listsJSON to listData as text
        set AppleScript's text item delimiters to ""

        -- Build final response
        set resultJSON to "{\"success\": true, \"data\": [" & listsJSON & "], \"error\": null}"

        return resultJSON
    end tell

on error errMsg number errNum
    -- Return error JSON on failure
    set escapedError to my escapeJSONString(errMsg)
    return "{\"success\": false, \"data\": [], \"error\": \"" & escapedError & " (error " & errNum & ")\"}"
end try

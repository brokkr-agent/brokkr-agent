#!/usr/bin/osascript
-- list-incomplete.scpt
-- Lists only incomplete (not completed) reminders from all lists in Reminders.app
--
-- Output format:
-- {"success": true, "data": [{id, name, body, completed, dueDate, priority, listName}, ...], "error": null}
--
-- Date format in output: ISO 8601 (e.g., "2026-02-01T14:00:00") or null if no due date

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

try
    tell application "Reminders"
        set reminderList to {}
        set allLists to lists

        repeat with reminderListObj in allLists
            set listName to name of reminderListObj

            -- Get only incomplete reminders from this list
            set incompleteReminders to (reminders of reminderListObj whose completed is false)

            repeat with rem in incompleteReminders
                set remId to id of rem
                set remName to name of rem

                -- Get optional body property safely
                try
                    set remBody to body of rem
                    if remBody is missing value then set remBody to ""
                on error
                    set remBody to ""
                end try

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
                set remJSON to remJSON & ", \"completed\": false"  -- Always false for incomplete
                set remJSON to remJSON & ", \"dueDate\": " & dueDateStr
                set remJSON to remJSON & ", \"priority\": " & (remPriority as text)
                set remJSON to remJSON & ", \"listName\": \"" & my escapeJSONString(listName) & "\"}"

                set end of reminderList to remJSON
            end repeat
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

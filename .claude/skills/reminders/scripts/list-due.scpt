#!/usr/bin/osascript
-- list-due.scpt
-- Lists reminders due within a specified date range from Reminders.app
--
-- Usage:
--   osascript list-due.scpt                           # Due today
--   osascript list-due.scpt "2026-02-01"              # Due on single day
--   osascript list-due.scpt "2026-02-01" "2026-02-07" # Due within date range
--
-- Output format:
-- {"success": true, "data": [{id, name, body, completed, dueDate, priority, listName}, ...], "error": null}
--
-- Date format in output: ISO 8601 (e.g., "2026-02-01T14:00:00")

on run argv
    set startDateStr to ""
    set endDateStr to ""

    -- Parse command line arguments
    if (count of argv) >= 1 then
        set startDateStr to item 1 of argv
    end if
    if (count of argv) >= 2 then
        set endDateStr to item 2 of argv
    end if

    try
        -- Calculate date range
        set queryStartDate to current date
        set queryEndDate to current date

        if startDateStr is "" then
            -- No arguments: default to today (midnight to midnight)
            set time of queryStartDate to 0
            set time of queryEndDate to 86399 -- 23:59:59
        else if endDateStr is "" then
            -- Single date argument: that day only
            set queryStartDate to my parseISODate(startDateStr)
            set time of queryStartDate to 0
            set queryEndDate to queryStartDate + (1 * days) - 1
        else
            -- Two date arguments: date range
            set queryStartDate to my parseISODate(startDateStr)
            set time of queryStartDate to 0
            set queryEndDate to my parseISODate(endDateStr)
            set time of queryEndDate to 86399 -- 23:59:59
        end if

        tell application "Reminders"
            set reminderList to {}
            set allLists to lists

            repeat with reminderListObj in allLists
                set listName to name of reminderListObj

                -- Get reminders with due dates in range
                try
                    set dueReminders to (reminders of reminderListObj whose due date >= queryStartDate and due date <= queryEndDate)

                    repeat with rem in dueReminders
                        set remId to id of rem
                        set remName to name of rem

                        -- Get optional body property safely
                        try
                            set remBody to body of rem
                            if remBody is missing value then set remBody to ""
                        on error
                            set remBody to ""
                        end try

                        set remCompleted to completed of rem

                        -- Get due date (we know it exists since we filtered by it)
                        set remDueDate to due date of rem
                        set dueDateStr to "\"" & my formatISODate(remDueDate) & "\""

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
                    end repeat
                on error errMsg
                    -- Skip lists that can't be filtered (shouldn't happen normally)
                end try
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

on parseISODate(dateStr)
    -- Parse YYYY-MM-DD format into AppleScript date
    set AppleScript's text item delimiters to "-"
    set dateParts to text items of dateStr
    set AppleScript's text item delimiters to ""

    set theYear to item 1 of dateParts as integer
    set theMonth to item 2 of dateParts as integer
    set theDay to item 3 of dateParts as integer

    -- Create a date object
    set theDate to current date
    set year of theDate to theYear
    set month of theDate to theMonth
    set day of theDate to theDay
    set time of theDate to 0

    return theDate
end parseISODate

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

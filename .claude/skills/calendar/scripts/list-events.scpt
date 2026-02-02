#!/usr/bin/osascript
-- list-events.scpt
-- Lists calendar events within a specified date range from Calendar.app
--
-- Usage:
--   osascript list-events.scpt                      # Today's events
--   osascript list-events.scpt "2026-02-01"         # Single day's events
--   osascript list-events.scpt "2026-02-01" "2026-02-07"  # Date range
--
-- Output format:
-- {"success": true, "data": [{uid, summary, startDate, endDate, location, notes, allDay, calendar}, ...], "error": null}
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

        tell application "Calendar"
            set eventList to {}
            set allCalendars to calendars

            repeat with cal in allCalendars
                set calName to name of cal

                -- Get events within the date range
                try
                    set calEvents to (every event of cal whose start date >= queryStartDate and start date <= queryEndDate)

                    repeat with evt in calEvents
                        set evtUID to uid of evt
                        set evtSummary to summary of evt
                        set evtStart to start date of evt
                        set evtEnd to end date of evt
                        set evtAllDay to allday event of evt

                        -- Get optional properties safely
                        try
                            set evtLocation to location of evt
                            if evtLocation is missing value then set evtLocation to ""
                        on error
                            set evtLocation to ""
                        end try

                        try
                            set evtNotes to description of evt
                            if evtNotes is missing value then set evtNotes to ""
                        on error
                            set evtNotes to ""
                        end try

                        -- Build JSON object for this event
                        set evtJSON to "{\"uid\": \"" & my escapeJSONString(evtUID) & "\""
                        set evtJSON to evtJSON & ", \"summary\": \"" & my escapeJSONString(evtSummary) & "\""
                        set evtJSON to evtJSON & ", \"startDate\": \"" & my formatISODate(evtStart) & "\""
                        set evtJSON to evtJSON & ", \"endDate\": \"" & my formatISODate(evtEnd) & "\""
                        set evtJSON to evtJSON & ", \"location\": \"" & my escapeJSONString(evtLocation) & "\""
                        set evtJSON to evtJSON & ", \"notes\": \"" & my escapeJSONString(evtNotes) & "\""

                        if evtAllDay then
                            set evtJSON to evtJSON & ", \"allDay\": true"
                        else
                            set evtJSON to evtJSON & ", \"allDay\": false"
                        end if

                        set evtJSON to evtJSON & ", \"calendar\": \"" & my escapeJSONString(calName) & "\"}"

                        set end of eventList to evtJSON
                    end repeat
                on error errMsg
                    -- Skip calendars that can't be read (e.g., Birthdays calendar may have issues)
                end try
            end repeat

            -- Join event objects with commas
            set AppleScript's text item delimiters to ", "
            set eventsJSON to eventList as text
            set AppleScript's text item delimiters to ""

            -- Build final response
            set resultJSON to "{\"success\": true, \"data\": [" & eventsJSON & "], \"error\": null}"

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

#!/usr/bin/osascript
-- find-event.scpt
-- Finds calendar events by UID or summary search from Calendar.app
--
-- Usage:
--   osascript find-event.scpt '{"uid":"event-uid-here"}'
--   osascript find-event.scpt '{"summary":"Meeting"}'
--   osascript find-event.scpt '{"summary":"Meeting","startDate":"2026-02-01","endDate":"2026-02-28"}'
--
-- Required parameters (at least one):
--   uid      - Exact match event UID (takes precedence if both provided)
--   summary  - Case-insensitive partial match on event summary
--
-- Optional parameters:
--   startDate - ISO date (YYYY-MM-DD) to start search range (default: -30 days from today)
--   endDate   - ISO date (YYYY-MM-DD) to end search range (default: +30 days from today)
--
-- Output format:
-- {"success": true, "data": [{uid, summary, startDate, endDate, location, notes, calendar}, ...], "error": null}

on run argv
    -- Check for arguments
    if (count of argv) < 1 then
        return "{\"success\": false, \"data\": [], \"error\": \"Missing required JSON argument\"}"
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
                        obj.uid || '',
                        obj.summary || '',
                        obj.startDate || '',
                        obj.endDate || ''
                    ];
                } catch (e) {
                    return ['ERROR', e.message, '', ''];
                }
            })()
        "

        set parsedValues to run script jsScript in "JavaScript"

        -- Extract values from the returned list
        set searchUID to item 1 of parsedValues
        set searchSummary to item 2 of parsedValues
        set startDateStr to item 3 of parsedValues
        set endDateStr to item 4 of parsedValues

        -- Check for JSON parse error
        if searchUID is "ERROR" then
            return "{\"success\": false, \"data\": [], \"error\": \"Invalid JSON: " & my escapeJSONString(searchSummary) & "\"}"
        end if

        -- Validate that at least one search parameter is provided
        if searchUID is "" and searchSummary is "" then
            return "{\"success\": false, \"data\": [], \"error\": \"At least one of uid or summary must be provided\"}"
        end if

        -- Calculate default date range (+/- 30 days from today)
        set queryStartDate to current date
        set queryEndDate to current date

        if startDateStr is "" then
            set queryStartDate to queryStartDate - (30 * days)
        else
            set queryStartDate to my parseISODate(startDateStr)
        end if
        set time of queryStartDate to 0

        if endDateStr is "" then
            set queryEndDate to queryEndDate + (30 * days)
        else
            set queryEndDate to my parseISODate(endDateStr)
        end if
        set time of queryEndDate to 86399 -- 23:59:59

        -- Prepare lowercase search summary for case-insensitive matching
        set lowerSearchSummary to my toLowerCase(searchSummary)

        tell application "Calendar"
            set eventList to {}
            set allCalendars to calendars

            repeat with cal in allCalendars
                set calName to name of cal

                try
                    -- Get events based on search type
                    if searchUID is not "" then
                        -- UID search: exact match
                        try
                            set matchingEvent to (first event of cal whose uid is searchUID)
                            set eventList to eventList & my buildEventJSON(matchingEvent, calName)
                            -- UID is unique, so we can exit early if found
                            exit repeat
                        on error
                            -- Event not found in this calendar, continue
                        end try
                    else
                        -- Summary search: get events in date range, then filter
                        set calEvents to (every event of cal whose start date >= queryStartDate and start date <= queryEndDate)

                        repeat with evt in calEvents
                            set evtSummary to summary of evt
                            set lowerEvtSummary to my toLowerCase(evtSummary)

                            -- Case-insensitive contains match
                            if lowerEvtSummary contains lowerSearchSummary then
                                set eventList to eventList & my buildEventJSON(evt, calName)
                            end if
                        end repeat
                    end if
                on error errMsg
                    -- Skip calendars that can't be read
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

on buildEventJSON(evt, calName)
    tell application "Calendar"
        set evtUID to uid of evt
        set evtSummary to summary of evt
        set evtStart to start date of evt
        set evtEnd to end date of evt

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
        set evtJSON to evtJSON & ", \"calendar\": \"" & my escapeJSONString(calName) & "\"}"

        return evtJSON
    end tell
end buildEventJSON

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

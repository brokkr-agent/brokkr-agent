#!/usr/bin/osascript
-- create-event.scpt
-- Creates a new calendar event in Calendar.app
--
-- Usage:
--   osascript create-event.scpt '{"summary":"Meeting","startDate":"2026-02-01T14:00:00","endDate":"2026-02-01T15:00:00"}'
--   osascript create-event.scpt '{"summary":"Meeting","startDate":"2026-02-01T14:00:00","endDate":"2026-02-01T15:00:00","calendar":"Home","location":"Office","notes":"Discussion"}'
--   osascript create-event.scpt '{"summary":"All Day Event","startDate":"2026-02-01","endDate":"2026-02-02","allDay":true}'
--
-- Required parameters:
--   summary   - Event title (required)
--   startDate - ISO 8601 date string (required) - YYYY-MM-DDTHH:MM:SS or YYYY-MM-DD for all-day
--   endDate   - ISO 8601 date string (required) - YYYY-MM-DDTHH:MM:SS or YYYY-MM-DD for all-day
--
-- Optional parameters:
--   calendar  - Target calendar name (defaults to first writable calendar)
--   location  - Event location
--   notes     - Event notes/description
--   allDay    - Boolean for all-day event (default: false)
--
-- Output format:
-- {"success": true, "data": {"uid": "created-event-uid", "summary": "Meeting"}, "error": null}

on run argv
    -- Check for arguments
    if (count of argv) < 1 then
        return "{\"success\": false, \"data\": null, \"error\": \"Missing required JSON argument. Usage: osascript create-event.scpt '{\\\"summary\\\":\\\"Event\\\",\\\"startDate\\\":\\\"2026-02-01T14:00:00\\\",\\\"endDate\\\":\\\"2026-02-01T15:00:00\\\"}'}\"}"
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
                    // Return as array: [summary, startDate, endDate, calendar, location, notes, allDay]
                    return [
                        obj.summary || '',
                        obj.startDate || '',
                        obj.endDate || '',
                        obj.calendar || '',
                        obj.location || '',
                        obj.notes || '',
                        obj.allDay === true ? 'true' : 'false'
                    ];
                } catch (e) {
                    return ['ERROR', e.message, '', '', '', '', ''];
                }
            })()
        "

        set parsedValues to run script jsScript in "JavaScript"

        -- Extract values from the returned list
        set eventSummary to item 1 of parsedValues
        set eventStartDate to item 2 of parsedValues
        set eventEndDate to item 3 of parsedValues
        set eventCalendar to item 4 of parsedValues
        set eventLocation to item 5 of parsedValues
        set eventNotes to item 6 of parsedValues
        set eventAllDayStr to item 7 of parsedValues

        -- Check for JSON parse error
        if eventSummary is "ERROR" then
            return "{\"success\": false, \"data\": null, \"error\": \"Invalid JSON: " & my escapeJSONString(eventStartDate) & "\"}"
        end if

        -- Validate required fields
        if eventSummary is "" then
            return "{\"success\": false, \"data\": null, \"error\": \"Missing required field: summary\"}"
        end if

        if eventStartDate is "" then
            return "{\"success\": false, \"data\": null, \"error\": \"Missing required field: startDate\"}"
        end if

        if eventEndDate is "" then
            return "{\"success\": false, \"data\": null, \"error\": \"Missing required field: endDate\"}"
        end if

        -- Parse dates
        set startDate to my parseISODateTime(eventStartDate)
        set endDate to my parseISODateTime(eventEndDate)

        -- Handle allDay boolean
        set isAllDay to (eventAllDayStr is "true")

        tell application "Calendar"
            -- Find target calendar
            set targetCalendar to missing value

            if eventCalendar is not "" then
                -- Try to find the specified calendar
                try
                    set targetCalendar to calendar eventCalendar
                on error
                    -- Calendar not found
                    return "{\"success\": false, \"data\": null, \"error\": \"Calendar not found: " & my escapeJSONString(eventCalendar) & "\"}"
                end try

                -- Check if calendar is writable
                if not (writable of targetCalendar) then
                    return "{\"success\": false, \"data\": null, \"error\": \"Calendar is not writable: " & my escapeJSONString(eventCalendar) & "\"}"
                end if
            else
                -- Use first writable calendar
                set allCalendars to calendars
                repeat with cal in allCalendars
                    if writable of cal then
                        set targetCalendar to cal
                        exit repeat
                    end if
                end repeat

                if targetCalendar is missing value then
                    return "{\"success\": false, \"data\": null, \"error\": \"No writable calendar found\"}"
                end if
            end if

            -- Build event properties
            set eventProps to {summary:eventSummary, start date:startDate, end date:endDate, allday event:isAllDay}

            -- Create the event
            set newEvent to make new event at end of events of targetCalendar with properties eventProps

            -- Set optional properties after creation
            if eventLocation is not "" then
                set location of newEvent to eventLocation
            end if

            if eventNotes is not "" then
                set description of newEvent to eventNotes
            end if

            -- Get the UID of the created event
            set eventUID to uid of newEvent

            -- Build success response
            set resultJSON to "{\"success\": true, \"data\": {\"uid\": \"" & my escapeJSONString(eventUID) & "\", \"summary\": \"" & my escapeJSONString(eventSummary) & "\"}, \"error\": null}"

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

    -- Check if it's just a date (all-day event) or date+time
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
        -- Date only: YYYY-MM-DD (for all-day events)
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

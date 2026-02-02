#!/usr/bin/osascript
-- modify-event.scpt
-- Modifies an existing calendar event using delete-and-recreate strategy
--
-- Note: AppleScript has limitations editing events directly. This script uses
-- a workaround: delete the original event and create a new one with modifications.
-- The UID will change as a result.
--
-- Usage:
--   osascript modify-event.scpt '{"uid":"event-uid","summary":"New Title"}'
--   osascript modify-event.scpt '{"uid":"event-uid","location":"New Location","notes":"Updated notes"}'
--
-- Required parameters:
--   uid - Event UID to modify (required)
--
-- Updatable fields (at least one required):
--   summary   - Event title
--   startDate - ISO 8601 date string
--   endDate   - ISO 8601 date string
--   location  - Event location
--   notes     - Event notes/description
--   allDay    - Boolean for all-day event
--
-- Output format:
-- {"success": true, "data": {"uid": "new-event-uid", "summary": "...", "modified": ["summary", "location"]}, "error": null}

on run argv
    if (count of argv) < 1 then
        return "{\"success\": false, \"data\": null, \"error\": \"Missing required JSON argument\"}"
    end if

    set jsonInput to item 1 of argv

    try
        set escapedInput to my escapeForJS(jsonInput)

        set jsScript to "
            (function() {
                var input = \"" & escapedInput & "\";
                try {
                    var obj = JSON.parse(input);
                    return [
                        obj.uid || '',
                        obj.summary !== undefined ? obj.summary : '###UNCHANGED###',
                        obj.startDate !== undefined ? obj.startDate : '###UNCHANGED###',
                        obj.endDate !== undefined ? obj.endDate : '###UNCHANGED###',
                        obj.location !== undefined ? obj.location : '###UNCHANGED###',
                        obj.notes !== undefined ? obj.notes : '###UNCHANGED###',
                        obj.allDay !== undefined ? (obj.allDay ? 'true' : 'false') : '###UNCHANGED###',
                        obj.calendar || ''
                    ].join('|||');
                } catch (e) {
                    return 'ERROR:' + e.message;
                }
            })()
        "

        set parseResult to do shell script "osascript -l JavaScript -e " & quoted form of jsScript

        if parseResult starts with "ERROR:" then
            return "{\"success\": false, \"data\": null, \"error\": \"Invalid JSON input: " & (text 7 thru -1 of parseResult) & "\"}"
        end if

        set AppleScript's text item delimiters to "|||"
        set params to text items of parseResult
        set AppleScript's text item delimiters to ""

        set targetUID to item 1 of params
        set newSummary to item 2 of params
        set newStartDate to item 3 of params
        set newEndDate to item 4 of params
        set newLocation to item 5 of params
        set newNotes to item 6 of params
        set newAllDay to item 7 of params
        set targetCalendar to item 8 of params

        if targetUID is "" then
            return "{\"success\": false, \"data\": null, \"error\": \"Missing required field: uid\"}"
        end if

        -- Check if at least one field is being modified
        if newSummary is "###UNCHANGED###" and newStartDate is "###UNCHANGED###" and newEndDate is "###UNCHANGED###" and newLocation is "###UNCHANGED###" and newNotes is "###UNCHANGED###" and newAllDay is "###UNCHANGED###" then
            return "{\"success\": false, \"data\": null, \"error\": \"No fields to update. Provide at least one of: summary, startDate, endDate, location, notes, allDay\"}"
        end if

        -- Track modified fields
        set modifiedFields to {}

        tell application "Calendar"
            -- Find the event
            set eventFound to false
            set sourceCal to missing value
            set sourceEvent to missing value

            repeat with cal in calendars
                if targetCalendar is "" or name of cal is targetCalendar then
                    try
                        set matchingEvents to (every event of cal whose uid is targetUID)
                        if (count of matchingEvents) > 0 then
                            set sourceEvent to item 1 of matchingEvents
                            set sourceCal to cal
                            set eventFound to true
                            exit repeat
                        end if
                    end try
                end if
            end repeat

            if not eventFound then
                return "{\"success\": false, \"data\": null, \"error\": \"Event not found with UID: " & targetUID & "\"}"
            end if

            -- Read current properties
            set origSummary to summary of sourceEvent
            set origStartDate to start date of sourceEvent
            set origEndDate to end date of sourceEvent
            set origLocation to ""
            try
                set origLocation to location of sourceEvent
            end try
            set origNotes to ""
            try
                set origNotes to description of sourceEvent
            end try
            set origAllDay to allday event of sourceEvent

            -- Apply modifications
            set finalSummary to origSummary
            if newSummary is not "###UNCHANGED###" then
                set finalSummary to newSummary
                set end of modifiedFields to "summary"
            end if

            set finalStartDate to origStartDate
            if newStartDate is not "###UNCHANGED###" then
                set finalStartDate to my parseISO8601(newStartDate)
                set end of modifiedFields to "startDate"
            end if

            set finalEndDate to origEndDate
            if newEndDate is not "###UNCHANGED###" then
                set finalEndDate to my parseISO8601(newEndDate)
                set end of modifiedFields to "endDate"
            end if

            set finalLocation to origLocation
            if newLocation is not "###UNCHANGED###" then
                set finalLocation to newLocation
                set end of modifiedFields to "location"
            end if

            set finalNotes to origNotes
            if newNotes is not "###UNCHANGED###" then
                set finalNotes to newNotes
                set end of modifiedFields to "notes"
            end if

            set finalAllDay to origAllDay
            if newAllDay is not "###UNCHANGED###" then
                set finalAllDay to (newAllDay is "true")
                set end of modifiedFields to "allDay"
            end if

            -- Delete original event
            delete sourceEvent

            -- Create new event with modifications
            tell sourceCal
                set newEvent to make new event with properties {summary:finalSummary, start date:finalStartDate, end date:finalEndDate, allday event:finalAllDay}

                if finalLocation is not "" then
                    set location of newEvent to finalLocation
                end if

                if finalNotes is not "" then
                    set description of newEvent to finalNotes
                end if

                set newUID to uid of newEvent
            end tell

            -- Build modified fields JSON array
            set modifiedJSON to "["
            repeat with i from 1 to count of modifiedFields
                if i > 1 then set modifiedJSON to modifiedJSON & ", "
                set modifiedJSON to modifiedJSON & "\"" & item i of modifiedFields & "\""
            end repeat
            set modifiedJSON to modifiedJSON & "]"

            return "{\"success\": true, \"data\": {\"uid\": \"" & newUID & "\", \"summary\": \"" & my escapeForJSON(finalSummary) & "\", \"modified\": " & modifiedJSON & "}, \"error\": null}"

        end tell

    on error errMsg number errNum
        return "{\"success\": false, \"data\": null, \"error\": \"" & my escapeForJSON(errMsg) & "\"}"
    end try
end run

on escapeForJS(theText)
    set resultText to ""
    repeat with i from 1 to length of theText
        set c to character i of theText
        if c is "\"" then
            set resultText to resultText & "\\\""
        else if c is "\\" then
            set resultText to resultText & "\\\\"
        else if c is (ASCII character 10) then
            set resultText to resultText & "\\n"
        else if c is (ASCII character 13) then
            set resultText to resultText & "\\r"
        else
            set resultText to resultText & c
        end if
    end repeat
    return resultText
end escapeForJS

on escapeForJSON(theText)
    set resultText to ""
    repeat with i from 1 to length of theText
        set c to character i of theText
        if c is "\"" then
            set resultText to resultText & "\\\""
        else if c is "\\" then
            set resultText to resultText & "\\\\"
        else if c is (ASCII character 10) then
            set resultText to resultText & "\\n"
        else if c is (ASCII character 13) then
            set resultText to resultText & "\\r"
        else
            set resultText to resultText & c
        end if
    end repeat
    return resultText
end escapeForJSON

on parseISO8601(dateStr)
    set yr to text 1 thru 4 of dateStr as integer
    set mo to text 6 thru 7 of dateStr as integer
    set dy to text 9 thru 10 of dateStr as integer
    set hr to 0
    set mn to 0
    set sc to 0
    if length of dateStr > 10 then
        set hr to text 12 thru 13 of dateStr as integer
        set mn to text 15 thru 16 of dateStr as integer
        if length of dateStr > 16 then
            set sc to text 18 thru 19 of dateStr as integer
        end if
    end if
    set theDate to current date
    set year of theDate to yr
    set month of theDate to mo
    set day of theDate to dy
    set hours of theDate to hr
    set minutes of theDate to mn
    set seconds of theDate to sc
    return theDate
end parseISO8601

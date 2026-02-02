#!/usr/bin/osascript
-- check-conflicts.scpt
-- Checks for scheduling conflicts in a proposed time range
--
-- Usage:
--   osascript check-conflicts.scpt '{"startDate":"2026-02-01T14:00:00","endDate":"2026-02-01T15:00:00"}'
--   osascript check-conflicts.scpt '{"startDate":"2026-02-01T14:00:00","endDate":"2026-02-01T15:00:00","excludeCalendars":["Holidays"]}'
--
-- Required parameters:
--   startDate - ISO 8601 date string (proposed start)
--   endDate   - ISO 8601 date string (proposed end)
--
-- Optional parameters:
--   excludeCalendars - Array of calendar names to skip
--   includeAllDay    - Boolean to include all-day events (default: false)
--
-- Output format:
-- {"success": true, "data": {"hasConflicts": true, "conflicts": [...]}, "error": null}

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
                    var excludeList = (obj.excludeCalendars || []).join('|||');
                    return [
                        obj.startDate || '',
                        obj.endDate || '',
                        excludeList,
                        obj.includeAllDay === true ? 'true' : 'false'
                    ].join('^^^');
                } catch (e) {
                    return 'ERROR:' + e.message;
                }
            })()
        "

        set parseResult to do shell script "osascript -l JavaScript -e " & quoted form of jsScript

        if parseResult starts with "ERROR:" then
            return "{\"success\": false, \"data\": null, \"error\": \"Invalid JSON input: " & (text 7 thru -1 of parseResult) & "\"}"
        end if

        set AppleScript's text item delimiters to "^^^"
        set params to text items of parseResult
        set AppleScript's text item delimiters to ""

        set proposedStartStr to item 1 of params
        set proposedEndStr to item 2 of params
        set excludeListStr to item 3 of params
        set includeAllDayStr to item 4 of params

        if proposedStartStr is "" then
            return "{\"success\": false, \"data\": null, \"error\": \"Missing required field: startDate\"}"
        end if

        if proposedEndStr is "" then
            return "{\"success\": false, \"data\": null, \"error\": \"Missing required field: endDate\"}"
        end if

        -- Parse exclude list
        set excludeCalendars to {}
        if excludeListStr is not "" then
            set AppleScript's text item delimiters to "|||"
            set excludeCalendars to text items of excludeListStr
            set AppleScript's text item delimiters to ""
        end if

        set includeAllDay to (includeAllDayStr is "true")

        -- Parse dates
        set proposedStart to my parseISO8601(proposedStartStr)
        set proposedEnd to my parseISO8601(proposedEndStr)

        -- Find conflicts
        set conflictList to {}

        tell application "Calendar"
            repeat with cal in calendars
                set calName to name of cal

                -- Skip excluded calendars
                set shouldSkip to false
                repeat with excl in excludeCalendars
                    if calName is excl then
                        set shouldSkip to true
                        exit repeat
                    end if
                end repeat

                if not shouldSkip then
                    try
                        -- Get events that might conflict (within a day buffer)
                        set searchStart to proposedStart - (1 * days)
                        set searchEnd to proposedEnd + (1 * days)
                        set calEvents to (every event of cal whose start date >= searchStart and start date <= searchEnd)

                        repeat with evt in calEvents
                            set evtStart to start date of evt
                            set evtEnd to end date of evt
                            set isAllDay to allday event of evt

                            -- Skip all-day events unless requested
                            if isAllDay and not includeAllDay then
                                -- skip
                            else
                                -- Check for overlap: (evtStart < proposedEnd) AND (evtEnd > proposedStart)
                                if (evtStart < proposedEnd) and (evtEnd > proposedStart) then
                                    set evtUID to uid of evt
                                    set evtSummary to summary of evt
                                    set evtStartISO to my formatISO8601(evtStart)
                                    set evtEndISO to my formatISO8601(evtEnd)

                                    set conflictJSON to "{\"uid\": \"" & evtUID & "\", \"summary\": \"" & my escapeForJSON(evtSummary) & "\", \"startDate\": \"" & evtStartISO & "\", \"endDate\": \"" & evtEndISO & "\", \"calendar\": \"" & my escapeForJSON(calName) & "\"}"
                                    set end of conflictList to conflictJSON
                                end if
                            end if
                        end repeat
                    end try
                end if
            end repeat
        end tell

        -- Build response
        set hasConflicts to ((count of conflictList) > 0)
        set conflictsJSON to "[" & my joinList(conflictList, ", ") & "]"

        return "{\"success\": true, \"data\": {\"hasConflicts\": " & hasConflicts & ", \"conflicts\": " & conflictsJSON & "}, \"error\": null}"

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

on formatISO8601(theDate)
    set yr to year of theDate as string
    set mo to text -2 thru -1 of ("0" & (month of theDate as integer))
    set dy to text -2 thru -1 of ("0" & day of theDate)
    set hr to text -2 thru -1 of ("0" & hours of theDate)
    set mn to text -2 thru -1 of ("0" & minutes of theDate)
    set sc to text -2 thru -1 of ("0" & seconds of theDate)
    return yr & "-" & mo & "-" & dy & "T" & hr & ":" & mn & ":" & sc
end formatISO8601

on joinList(theList, delimiter)
    set AppleScript's text item delimiters to delimiter
    set result to theList as string
    set AppleScript's text item delimiters to ""
    return result
end joinList

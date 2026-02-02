#!/usr/bin/osascript
-- add-alarm.scpt
-- Adds an alarm to an existing calendar event in Calendar.app
--
-- Usage:
--   osascript add-alarm.scpt '{"uid":"event-uid","minutes":-15}'
--   osascript add-alarm.scpt '{"uid":"event-uid","minutes":-30,"type":"display"}'
--   osascript add-alarm.scpt '{"uid":"event-uid","minutes":-60,"type":"sound"}'
--
-- Required parameters:
--   uid     - Event UID to add alarm to
--   minutes - Minutes before event (negative) or after start (positive)
--
-- Optional parameters:
--   type    - "display" (default), "sound", or "email"
--
-- Output format:
-- {"success": true, "data": {"uid": "event-uid", "alarmAdded": true, "triggerMinutes": -15}, "error": null}

on run argv
    -- Check for arguments
    if (count of argv) < 1 then
        return "{\"success\": false, \"data\": null, \"error\": \"Missing required JSON argument. Usage: osascript add-alarm.scpt '{\\\"uid\\\":\\\"event-uid\\\",\\\"minutes\\\":-15}'}\"}"
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
                    // Return as array: [uid, minutes, type]
                    return [
                        obj.uid || '',
                        obj.minutes !== undefined ? String(obj.minutes) : '',
                        obj.type || 'display'
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

        -- Split the result
        set AppleScript's text item delimiters to "|||"
        set params to text items of parseResult
        set AppleScript's text item delimiters to ""

        set targetUID to item 1 of params
        set minutesStr to item 2 of params
        set alarmType to item 3 of params

        -- Validate required fields
        if targetUID is "" then
            return "{\"success\": false, \"data\": null, \"error\": \"Missing required field: uid\"}"
        end if

        if minutesStr is "" then
            return "{\"success\": false, \"data\": null, \"error\": \"Missing required field: minutes\"}"
        end if

        -- Validate alarm type
        if alarmType is not "display" and alarmType is not "sound" and alarmType is not "email" then
            return "{\"success\": false, \"data\": null, \"error\": \"Invalid alarm type: " & alarmType & ". Must be display, sound, or email\"}"
        end if

        -- Convert minutes to number
        set triggerMinutes to minutesStr as integer

        -- Find and update the event
        tell application "Calendar"
            set eventFound to false
            set targetCal to missing value
            set targetEvent to missing value

            -- Search for event by UID
            repeat with cal in calendars
                try
                    set matchingEvents to (every event of cal whose uid is targetUID)
                    if (count of matchingEvents) > 0 then
                        set targetEvent to item 1 of matchingEvents
                        set targetCal to cal
                        set eventFound to true
                        exit repeat
                    end if
                end try
            end repeat

            if not eventFound then
                return "{\"success\": false, \"data\": null, \"error\": \"Event not found with UID: " & targetUID & "\"}"
            end if

            -- Add alarm based on type
            tell targetEvent
                if alarmType is "display" then
                    make new display alarm at end of display alarms with properties {trigger interval:triggerMinutes}
                else if alarmType is "sound" then
                    make new sound alarm at end of sound alarms with properties {trigger interval:triggerMinutes}
                else if alarmType is "email" then
                    make new mail alarm at end of mail alarms with properties {trigger interval:triggerMinutes}
                end if
            end tell

            -- Return success response
            return "{\"success\": true, \"data\": {\"uid\": \"" & targetUID & "\", \"alarmAdded\": true, \"triggerMinutes\": " & triggerMinutes & "}, \"error\": null}"

        end tell

    on error errMsg number errNum
        return "{\"success\": false, \"data\": null, \"error\": \"" & my escapeForJSON(errMsg) & "\"}"
    end try
end run

-- Helper: Escape string for JavaScript string literal
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
        else if c is (ASCII character 9) then
            set resultText to resultText & "\\t"
        else
            set resultText to resultText & c
        end if
    end repeat
    return resultText
end escapeForJS

-- Helper: Escape string for JSON output
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
        else if c is (ASCII character 9) then
            set resultText to resultText & "\\t"
        else
            set resultText to resultText & c
        end if
    end repeat
    return resultText
end escapeForJSON

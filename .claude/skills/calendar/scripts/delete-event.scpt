#!/usr/bin/osascript
-- delete-event.scpt
-- Deletes a calendar event by UID from Calendar.app
--
-- Usage:
--   osascript delete-event.scpt '{"uid":"event-uid-to-delete"}'
--
-- Required parameters:
--   uid - The unique identifier of the event to delete (required)
--
-- Output format:
-- {"success": true, "data": {"uid": "deleted-uid", "deleted": true}, "error": null}
--
-- Error cases:
-- {"success": false, "data": null, "error": "Event not found with UID: ..."}
-- {"success": false, "data": null, "error": "Calendar is read-only: ..."}
--
-- Safety:
-- - Only deletes a single event by exact UID match
-- - Does not support bulk delete operations
-- - Searches all calendars for the matching event

on run argv
    -- Check for arguments
    if (count of argv) < 1 then
        return "{\"success\": false, \"data\": null, \"error\": \"Missing required JSON argument. Usage: osascript delete-event.scpt '{\\\"uid\\\":\\\"event-uid\\\"}'\"}"
    end if

    set jsonInput to item 1 of argv

    try
        -- Extract UID from JSON using JavaScript for Automation
        set escapedInput to my escapeForJS(jsonInput)

        set jsScript to "
            (function() {
                var input = \"" & escapedInput & "\";
                try {
                    var obj = JSON.parse(input);
                    // Return the UID (or empty string if not provided)
                    return obj.uid || '';
                } catch (e) {
                    return 'ERROR:' + e.message;
                }
            })()
        "

        set targetUID to run script jsScript in "JavaScript"

        -- Check for JSON parse error
        if targetUID starts with "ERROR:" then
            set errMsg to text 7 thru -1 of targetUID
            return "{\"success\": false, \"data\": null, \"error\": \"Invalid JSON: " & my escapeJSONString(errMsg) & "\"}"
        end if

        -- Validate required UID field
        if targetUID is "" then
            return "{\"success\": false, \"data\": null, \"error\": \"Missing required field: uid\"}"
        end if

        -- Handle null values from JSON
        if targetUID is "null" then
            return "{\"success\": false, \"data\": null, \"error\": \"Missing required field: uid (null is not valid)\"}"
        end if

        tell application "Calendar"
            set eventFound to false
            set eventDeleted to false
            set readOnlyCalendar to ""

            -- Search all calendars for the event
            repeat with cal in calendars
                set calName to name of cal

                try
                    -- Find events matching the UID
                    set matchingEvents to (every event of cal whose uid is targetUID)

                    if (count of matchingEvents) > 0 then
                        set eventFound to true

                        -- Check if calendar is writable
                        if not (writable of cal) then
                            set readOnlyCalendar to calName
                        else
                            -- Delete the matching event(s) - should be exactly one
                            repeat with evt in matchingEvents
                                delete evt
                                set eventDeleted to true
                            end repeat
                        end if

                        -- Exit after finding the event (UIDs are unique)
                        exit repeat
                    end if
                on error errMsg
                    -- Skip calendars that cannot be read (e.g., some subscribed calendars)
                end try
            end repeat

            -- Build response based on outcome
            if eventDeleted then
                return "{\"success\": true, \"data\": {\"uid\": \"" & my escapeJSONString(targetUID) & "\", \"deleted\": true}, \"error\": null}"
            else if eventFound and readOnlyCalendar is not "" then
                return "{\"success\": false, \"data\": null, \"error\": \"Calendar is read-only: " & my escapeJSONString(readOnlyCalendar) & "\"}"
            else
                return "{\"success\": false, \"data\": null, \"error\": \"Event not found with UID: " & my escapeJSONString(targetUID) & "\"}"
            end if
        end tell

    on error errMsg number errNum
        -- Return error JSON on failure
        set escapedError to my escapeJSONString(errMsg)
        return "{\"success\": false, \"data\": null, \"error\": \"" & escapedError & " (error " & errNum & ")\"}"
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

#!/usr/bin/osascript
-- list-calendars.scpt
-- Lists all calendars from Calendar.app and returns JSON output
--
-- Output format:
-- {"success": true, "data": [{name, type, writable}, ...], "error": null}
--
-- Calendar types: Local, CalDAV, Exchange, Subscription, Birthday, iCloud, Unknown

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

on inferCalendarType(calName, calWritable, calDesc)
    -- Infer calendar type from name, writability, and description
    -- Apple Calendar doesn't expose account type directly via AppleScript
    -- so we use heuristics based on well-known calendar patterns

    set lowerName to my toLowerCase(calName)

    -- Check description first if available
    if calDesc is not "" then
        if calDesc contains "CalDAV" then
            return "CalDAV"
        else if calDesc contains "Exchange" then
            return "Exchange"
        else if calDesc contains "Subscription" then
            return "Subscription"
        else if calDesc contains "iCloud" then
            return "iCloud"
        end if
    end if

    -- Well-known system calendars (read-only)
    if lowerName is "birthdays" or lowerName contains "birthday" then
        return "Birthday"
    else if lowerName is "us holidays" or lowerName contains "holidays" then
        return "Subscription"
    else if lowerName is "siri suggestions" or lowerName contains "siri" then
        return "Subscription"
    end if

    -- If writable, assume it's a user calendar (Local or iCloud)
    -- We can't distinguish between Local and iCloud without more info
    if calWritable then
        return "Local"
    else
        return "Subscription"
    end if
end inferCalendarType

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

try
    tell application "Calendar"
        set calendarList to {}
        set allCalendars to calendars

        repeat with cal in allCalendars
            set calName to name of cal
            set calWritable to writable of cal

            -- Get calendar description to determine type
            set calDesc to description of cal

            -- Handle nil description
            if calDesc is missing value then
                set calDesc to ""
            end if

            set calType to my inferCalendarType(calName, calWritable, calDesc)

            -- Build JSON object for this calendar
            set calJSON to "{\"name\": \"" & my escapeJSONString(calName) & "\", \"type\": \"" & calType & "\", \"writable\": "

            if calWritable then
                set calJSON to calJSON & "true}"
            else
                set calJSON to calJSON & "false}"
            end if

            set end of calendarList to calJSON
        end repeat

        -- Join calendar objects with commas
        set AppleScript's text item delimiters to ", "
        set calendarsJSON to calendarList as text
        set AppleScript's text item delimiters to ""

        -- Build final response
        set resultJSON to "{\"success\": true, \"data\": [" & calendarsJSON & "], \"error\": null}"

        return resultJSON
    end tell

on error errMsg number errNum
    -- Return error JSON on failure
    set escapedError to my escapeJSONString(errMsg)
    return "{\"success\": false, \"data\": [], \"error\": \"" & escapedError & " (error " & errNum & ")\"}"
end try

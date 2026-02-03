#!/usr/bin/osascript
-- list-folders.scpt
-- Lists all folders from Notes.app and returns JSON output
--
-- Output format:
-- {"success": true, "data": [{name, id}, ...], "error": null}

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

try
    tell application "Notes"
        set folderData to {}
        set defaultAccount to default account
        set allFolders to folders of defaultAccount

        repeat with fld in allFolders
            set folderName to name of fld
            set folderID to id of fld

            -- Build JSON object for this folder
            set folderJSON to "{\"name\": \"" & my escapeJSONString(folderName) & "\", \"id\": \"" & my escapeJSONString(folderID) & "\"}"

            set end of folderData to folderJSON
        end repeat

        -- Join folder objects with commas
        set AppleScript's text item delimiters to ", "
        set foldersJSON to folderData as text
        set AppleScript's text item delimiters to ""

        -- Build final response
        set resultJSON to "{\"success\": true, \"data\": [" & foldersJSON & "], \"error\": null}"

        return resultJSON
    end tell

on error errMsg number errNum
    -- Return error JSON on failure
    set escapedError to my escapeJSONString(errMsg)
    return "{\"success\": false, \"data\": [], \"error\": \"" & escapedError & " (error " & errNum & ")\"}"
end try

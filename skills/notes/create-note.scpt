#!/usr/bin/osascript
-- create-note.scpt
-- Creates a new note in Notes.app and returns JSON output
--
-- Usage: osascript create-note.scpt "title" "body" [folder-name]
-- If no folder is specified, defaults to "Notes"
--
-- Output format:
-- {"success": true, "data": {id, name, folder, creationDate}, "error": null}

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

on formatDate(theDate)
    -- Format date as ISO 8601 string
    if theDate is missing value then
        return ""
    end if
    try
        set y to year of theDate as string
        set m to month of theDate as integer
        if m < 10 then set m to "0" & m
        set d to day of theDate as integer
        if d < 10 then set d to "0" & d
        set h to hours of theDate as integer
        if h < 10 then set h to "0" & h
        set min to minutes of theDate as integer
        if min < 10 then set min to "0" & min
        set s to seconds of theDate as integer
        if s < 10 then set s to "0" & s
        return y & "-" & m & "-" & d & "T" & h & ":" & min & ":" & s
    on error
        return ""
    end try
end formatDate

on run argv
    -- Validate arguments
    if (count of argv) < 2 then
        return "{\"success\": false, \"data\": null, \"error\": \"Usage: osascript create-note.scpt \\\"title\\\" \\\"body\\\" [folder-name]\"}"
    end if

    set noteTitle to item 1 of argv
    set noteBody to item 2 of argv
    set folderName to "Notes"
    if (count of argv) ≥ 3 then
        set folderName to item 3 of argv
    end if

    try
        tell application "Notes"
            set defaultAccount to default account

            -- Find the folder
            set targetFolder to missing value
            repeat with fld in folders of defaultAccount
                if name of fld is folderName then
                    set targetFolder to fld
                    exit repeat
                end if
            end repeat

            if targetFolder is missing value then
                return "{\"success\": false, \"data\": null, \"error\": \"Folder '" & my escapeJSONString(folderName) & "' not found\"}"
            end if

            -- Create the note with title and body
            -- Notes.app uses HTML for body content
            set newNote to make new note at targetFolder with properties {name:noteTitle, body:noteBody}

            -- Get note properties
            set noteID to id of newNote
            set noteName to name of newNote
            set noteCreated to creation date of newNote
        end tell

        -- Build JSON response for success
        set creationDateStr to my formatDate(noteCreated)
        set resultJSON to "{\"success\": true, \"data\": {\"id\": \"" & my escapeJSONString(noteID) & "\", \"name\": \"" & my escapeJSONString(noteName) & "\", \"folder\": \"" & my escapeJSONString(folderName) & "\", \"creationDate\": \"" & creationDateStr & "\"}, \"error\": null}"

        return resultJSON

    on error errMsg number errNum
        -- Return error JSON on failure
        set escapedError to my escapeJSONString(errMsg)
        return "{\"success\": false, \"data\": null, \"error\": \"" & escapedError & " (error " & errNum & ")\"}"
    end try
end run

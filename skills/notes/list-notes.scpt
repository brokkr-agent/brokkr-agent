#!/usr/bin/osascript
-- list-notes.scpt
-- Lists all notes in a specified folder from Notes.app and returns JSON output
--
-- Usage: osascript list-notes.scpt [folder-name]
-- If no folder is specified, defaults to "Notes"
--
-- Output format:
-- {"success": true, "data": [{name, id, creationDate, modificationDate, folder}...], "error": null}

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
    -- Get folder name from argument or default to "Notes"
    set folderName to "Notes"
    if (count of argv) > 0 then
        set folderName to item 1 of argv
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
                return "{\"success\": false, \"data\": [], \"error\": \"Folder '" & my escapeJSONString(folderName) & "' not found\"}"
            end if

            set noteData to {}
            set allNotes to notes of targetFolder

            repeat with n in allNotes
                set noteName to name of n
                set noteID to id of n
                set creationDateStr to my formatDate(creation date of n)
                set modificationDateStr to my formatDate(modification date of n)

                -- Build JSON object for this note
                set noteJSON to "{\"name\": \"" & my escapeJSONString(noteName) & "\", \"id\": \"" & my escapeJSONString(noteID) & "\", \"creationDate\": \"" & creationDateStr & "\", \"modificationDate\": \"" & modificationDateStr & "\", \"folder\": \"" & my escapeJSONString(folderName) & "\"}"

                set end of noteData to noteJSON
            end repeat

            -- Join note objects with commas
            set AppleScript's text item delimiters to ", "
            set notesJSON to noteData as text
            set AppleScript's text item delimiters to ""

            -- Build final response
            set resultJSON to "{\"success\": true, \"data\": [" & notesJSON & "], \"error\": null}"

            return resultJSON
        end tell

    on error errMsg number errNum
        -- Return error JSON on failure
        set escapedError to my escapeJSONString(errMsg)
        return "{\"success\": false, \"data\": [], \"error\": \"" & escapedError & " (error " & errNum & ")\"}"
    end try
end run

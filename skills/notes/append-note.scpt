#!/usr/bin/osascript
-- append-note.scpt
-- Appends content to an existing note in Notes.app
--
-- Usage: osascript append-note.scpt "note-id" "content to append"
-- Note ID format: x-coredata://UUID/ICNote/pNNN
--
-- Output format:
-- {"success": true, "data": {id, name, modificationDate}, "error": null}

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
    try
        if (count of argv) < 2 then
            return "{\"success\": false, \"data\": null, \"error\": \"Usage: osascript append-note.scpt \\\"note-id\\\" \\\"content to append\\\"\"}"
        end if

        set noteID to item 1 of argv
        set contentToAppend to item 2 of argv
        set foundNote to missing value

        tell application "Notes"
            set defaultAccount to default account
            set allFolders to folders of defaultAccount

            -- Find the note by ID across all folders
            repeat with fld in allFolders
                set folderNotes to notes of fld
                repeat with nte in folderNotes
                    if id of nte is noteID then
                        set foundNote to nte
                        exit repeat
                    end if
                end repeat
                if foundNote is not missing value then exit repeat
            end repeat

            if foundNote is missing value then
                return "{\"success\": false, \"data\": null, \"error\": \"Note not found with ID: " & my escapeJSONString(noteID) & "\"}"
            end if

            -- Get current body and append new content with line break
            set currentBody to body of foundNote
            set newBody to currentBody & "<br/>" & contentToAppend

            -- Set the updated body
            set body of foundNote to newBody

            -- Get updated note properties
            set noteName to name of foundNote
            set noteModified to modification date of foundNote
        end tell

        -- Format modification date
        set modificationDateStr to my formatDate(noteModified)

        -- Escape all string values for JSON
        set escapedID to my escapeJSONString(noteID)
        set escapedName to my escapeJSONString(noteName)

        -- Build JSON response manually
        set resultJSON to "{\"success\": true, \"data\": {\"id\": \"" & escapedID & "\", \"name\": \"" & escapedName & "\", \"modificationDate\": \"" & modificationDateStr & "\"}, \"error\": null}"

        return resultJSON

    on error errMsg number errNum
        -- Return error JSON on failure
        set escapedError to my escapeJSONString(errMsg)
        return "{\"success\": false, \"data\": null, \"error\": \"" & escapedError & " (error " & errNum & ")\"}"
    end try
end run

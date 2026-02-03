#!/usr/bin/osascript
-- modify-note.scpt
-- Modify an existing note's title and/or body in Notes.app
--
-- Usage:
--   osascript modify-note.scpt "x-coredata://..." "New Title" ""       # Change title only
--   osascript modify-note.scpt "x-coredata://..." "" "New body"        # Change body only
--   osascript modify-note.scpt "x-coredata://..." "New Title" "New body"  # Change both
--
-- Arguments:
--   1. note-id   - Note ID to modify (x-coredata://...)
--   2. new-title - New title for the note (empty string to keep current)
--   3. new-body  - New body for the note (empty string to keep current)
--
-- Output format:
-- {"success": true, "data": {"id": "...", "name": "...", "modificationDate": "..."}, "error": null}

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
        -- Check for arguments
        if (count of argv) < 3 then
            return "{\"success\": false, \"data\": null, \"error\": \"Usage: osascript modify-note.scpt \\\"note-id\\\" \\\"new-title\\\" \\\"new-body\\\"\"}"
        end if

        set noteID to item 1 of argv
        set newTitle to item 2 of argv
        set newBody to item 3 of argv

        -- Validate required note ID
        if noteID is "" then
            return "{\"success\": false, \"data\": null, \"error\": \"Missing required argument: note-id\"}"
        end if

        -- Check that at least one field is being modified
        if newTitle is "" and newBody is "" then
            return "{\"success\": false, \"data\": null, \"error\": \"At least one of new-title or new-body must be provided\"}"
        end if

        set foundNote to missing value

        tell application "Notes"
            set defaultAccount to default account
            set allFolders to folders of defaultAccount

            -- Find the note by ID
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

            -- Check if note was found
            if foundNote is missing value then
                return "{\"success\": false, \"data\": null, \"error\": \"Note not found with ID: " & my escapeJSONString(noteID) & "\"}"
            end if

            -- Modify the note properties
            if newTitle is not "" then
                set name of foundNote to newTitle
            end if

            if newBody is not "" then
                set body of foundNote to newBody
            end if

            -- Get updated note details
            set updatedName to name of foundNote
            set updatedModDate to modification date of foundNote
        end tell

        -- Format the modification date
        set modDateStr to my formatDate(updatedModDate)

        -- Build success response
        set escapedID to my escapeJSONString(noteID)
        set escapedName to my escapeJSONString(updatedName)

        set resultJSON to "{\"success\": true, \"data\": {\"id\": \"" & escapedID & "\", \"name\": \"" & escapedName & "\", \"modificationDate\": \"" & modDateStr & "\"}, \"error\": null}"

        return resultJSON

    on error errMsg number errNum
        -- Return error JSON on failure
        set escapedError to my escapeJSONString(errMsg)
        return "{\"success\": false, \"data\": null, \"error\": \"" & escapedError & " (error " & errNum & ")\"}"
    end try
end run

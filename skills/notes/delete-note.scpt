#!/usr/bin/osascript
-- delete-note.scpt
-- Delete (move to Recently Deleted) a note by ID from Notes.app
--
-- Usage: osascript delete-note.scpt "note-id"
-- Note ID format: x-coredata://UUID/ICNote/pNNN
--
-- Output format:
-- {"success": true, "data": {"deleted": true, "id": "..."}, "error": null}

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

on run argv
    try
        if (count of argv) < 1 then
            return "{\"success\": false, \"data\": null, \"error\": \"Usage: osascript delete-note.scpt \\\"note-id\\\"\"}"
        end if

        set noteID to item 1 of argv
        set foundNote to missing value

        tell application "Notes"
            set defaultAccount to default account
            set allFolders to folders of defaultAccount

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

            -- Delete the note (moves to Recently Deleted)
            delete foundNote
        end tell

        -- Build success response
        set escapedID to my escapeJSONString(noteID)
        set resultJSON to "{\"success\": true, \"data\": {\"deleted\": true, \"id\": \"" & escapedID & "\"}, \"error\": null}"

        return resultJSON

    on error errMsg number errNum
        -- Return error JSON on failure
        set escapedError to my escapeJSONString(errMsg)
        return "{\"success\": false, \"data\": null, \"error\": \"" & escapedError & " (error " & errNum & ")\"}"
    end try
end run

#!/usr/bin/osascript
-- search-notes.scpt
-- Search notes by content or title across all folders in Notes.app
--
-- Usage: osascript search-notes.scpt "search-query" [scope]
-- Scope: "title" (search titles only), "body" (search body only), "all" (default, both)
--
-- Output format:
-- {"success": true, "data": [{id, name, folder, creationDate, modificationDate, snippet}...], "error": null}

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

on getSnippet(theText, maxLength)
    -- Get first N characters of text as a snippet
    if theText is "" or theText is missing value then
        return ""
    end if
    try
        set textLength to length of theText
        if textLength is less than or equal to maxLength then
            return theText
        else
            return (text 1 thru maxLength of theText) & "..."
        end if
    on error
        return ""
    end try
end getSnippet

on run argv
    try
        if (count of argv) < 1 then
            return "{\"success\": false, \"data\": [], \"error\": \"Usage: osascript search-notes.scpt \\\"search-query\\\" [scope]\"}"
        end if

        set searchQuery to item 1 of argv

        -- Get scope from second argument or default to "all"
        set searchScope to "all"
        if (count of argv) > 1 then
            set scopeArg to item 2 of argv
            if scopeArg is "title" or scopeArg is "body" or scopeArg is "all" then
                set searchScope to scopeArg
            end if
        end if

        set noteData to {}

        tell application "Notes"
            set defaultAccount to default account
            set allFolders to folders of defaultAccount

            repeat with fld in allFolders
                set folderName to name of fld
                set folderNotes to notes of fld

                repeat with nte in folderNotes
                    set noteID to id of nte
                    set noteName to name of nte
                    set noteBody to body of nte

                    -- Check if search query matches based on scope (case-insensitive)
                    set isMatch to false
                    set snippetSource to ""

                    ignoring case
                        if searchScope is "title" then
                            -- Search title only
                            if noteName contains searchQuery then
                                set isMatch to true
                                set snippetSource to noteName
                            end if
                        else if searchScope is "body" then
                            -- Search body only
                            if noteBody contains searchQuery then
                                set isMatch to true
                                set snippetSource to noteBody
                            end if
                        else
                            -- Search both (scope is "all")
                            if noteName contains searchQuery then
                                set isMatch to true
                                set snippetSource to noteName
                            else if noteBody contains searchQuery then
                                set isMatch to true
                                set snippetSource to noteBody
                            end if
                        end if
                    end ignoring

                    if isMatch then
                        set creationDateStr to my formatDate(creation date of nte)
                        set modificationDateStr to my formatDate(modification date of nte)

                        -- Get snippet (first 100 characters of matching content)
                        set snippetText to my getSnippet(snippetSource, 100)

                        -- Build JSON object for this note
                        set noteJSON to "{\"id\": \"" & my escapeJSONString(noteID) & "\", \"name\": \"" & my escapeJSONString(noteName) & "\", \"folder\": \"" & my escapeJSONString(folderName) & "\", \"creationDate\": \"" & creationDateStr & "\", \"modificationDate\": \"" & modificationDateStr & "\", \"snippet\": \"" & my escapeJSONString(snippetText) & "\"}"

                        set end of noteData to noteJSON
                    end if
                end repeat
            end repeat
        end tell

        -- Join note objects with commas
        set AppleScript's text item delimiters to ", "
        set notesJSON to noteData as text
        set AppleScript's text item delimiters to ""

        -- Build final response
        set resultJSON to "{\"success\": true, \"data\": [" & notesJSON & "], \"error\": null}"

        return resultJSON

    on error errMsg number errNum
        -- Return error JSON on failure
        set escapedError to my escapeJSONString(errMsg)
        return "{\"success\": false, \"data\": [], \"error\": \"" & escapedError & " (error " & errNum & ")\"}"
    end try
end run

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, you can obtain one at http://mozilla.org/MPL/2.0/.

import-page-title = Import

## Header

import-start = Import Tool

import-start-desc = Import settings or data from an application or file.

import-from-app = Import from Application

import-from-app-desc = Choose to import Accounts, Address Books, Calendars, and other data from:

import-from-file = Import from File

import-address-book = Import Address Book File

import-calendar = Import Calendar File

export-profile = Export

## Buttons

button-cancel = Cancel

button-back = Back

button-continue = Continue

button-export = Export

## Import from app steps

app-name-thunderbird = Thunderbird

app-name-seamonkey = SeaMonkey

app-name-outlook = Outlook

app-name-becky = Becky! Internet Mail

app-name-apple-mail = Apple Mail

source-file = Import from a File

## Import from file selections

file-profile = Import Backed-up Profile (.zip)

file-calendar = Import Calendars

file-addressbook = Import Address Books

# Variables:
#   $app (String) - The name of the app to import from
profiles-pane-title = Import from { $app }

profiles-pane-desc = Choose the location from which to import

profile-file-picker-dir = Select a profile folder

profile-file-picker-zip = Select a zip file (smaller than 2GB)

items-pane-title = Select what to import

items-pane-source = Source location:

items-pane-checkbox-accounts = Accounts and Settings

items-pane-checkbox-address-books = Address Books

items-pane-checkbox-calendars = Calendars

items-pane-checkbox-mail-messages = Mail Messages

## Import from address book file steps

import-from-addr-book-file-desc = Select the file type you would like to import:

addr-book-csv-file = Comma or tab separated file (.csv, .tsv)

addr-book-ldif-file = LDIF file (.ldif)

addr-book-vcard-file = vCard file (.vcf, .vcard)

addr-book-sqlite-file = SQLite database file (.sqlite)

addr-book-mab-file = Mork database file (.mab)

addr-book-file-picker = Select an address book file

addr-book-csv-field-map-title = Match field names

addr-book-csv-field-map-desc = Select address book fields corresponding to the source fields. Uncheck fields you do not want to import.

addr-book-directories-pane-title = Select the directory you would like to import into:

addr-book-directories-pane-source = Source file:

addr-book-import-into-new-directory = Create a new directory

## Import from address book file steps

import-from-calendar-file-desc = Select the iCalendar (.ics) file you would like to import.

calendar-items-loading = Loading items…

calendar-items-filter-input =
  .placeholder = Filter items…

calendar-select-all-items = Select all

calendar-deselect-all-items = Deselect all

calendar-import-into-new-calendar = Create a new calendar

## Import dialog

progress-pane-importing = Importing

progress-pane-exporting = Exporting

progress-pane-finished-desc = Finished.

progress-pane-restart-desc = Restart to finish importing.

error-pane-title = Error

error-message-zip-file-too-big = The selected zip file is larger than 2GB. Please extract it first, then import from the extracted folder instead.

error-message-extract-zip-file-failed = Failed to extract the zip file. Please extract it manually, then import from the extracted folder instead.

error-message-failed = Import failed unexpectedly, more information may be available in the Error Console.

error-failed-to-parse-ics-file = No importable items found in the file.

error-export-failed = Export failed unexpectedly, more information may be available in the Error Console.

## <csv-field-map> element

csv-first-row-contains-headers = First row contains field names

csv-source-field = Source field

csv-source-first-record = First record

csv-source-second-record = Second record

csv-target-field = Address book field

## Export tab

export-profile-desc = Export mail accounts, mail messages, address books, settings to a zip file. When needed, you can import the zip file to restore your profile.

export-profile-desc2 = If your current profile is larger than 2GB, we suggest you back it up by yourself.

export-open-profile-folder = Open profile folder

export-file-picker = Export to a zip file

export-brand-name = { -brand-product-name }

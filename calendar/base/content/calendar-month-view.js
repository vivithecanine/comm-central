/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals calendarNavigationBar, MozElements, MozXULElement, timeIndicator */

/* import-globals-from calendar-ui-utils.js */

"use strict";

// Wrap in a block to prevent leaking to window scope.
{
  const { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

  /**
   * Implements the Drag and Drop class for the Month Day Box view.
   *
   * @extends {MozElements.CalendarDnDContainer}
   */
  class CalendarMonthDayBox extends MozElements.CalendarDnDContainer {
    static get inheritedAttributes() {
      return {
        ".calendar-month-week-label": "relation,selected",
        ".calendar-month-day-label": "relation,selected,value",
      };
    }

    constructor() {
      super();
      this.addEventListener("mousedown", this.onMouseDown);
      this.addEventListener("dblclick", this.onDblClick);
      this.addEventListener("click", this.onClick);
      this.addEventListener("wheel", this.onWheel);
    }

    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasConnected) {
        return;
      }
      // this.hasConnected is set to true in super.connectedCallback.
      super.connectedCallback();

      this.mDate = null;
      this.mItemHash = {};
      this.mShowMonthLabel = false;

      this.setAttribute("orient", "vertical");

      let monthDayLabels = document.createXULElement("hbox");
      monthDayLabels.classList.add("calendar-month-day-box-dates");

      let weekLabel = document.createXULElement("label");
      weekLabel.setAttribute("data-label", "week");
      weekLabel.setAttribute("flex", "1");
      weekLabel.setAttribute("crop", "end");
      weekLabel.setAttribute("hidden", "true");
      weekLabel.style.pointerEvents = "none";
      weekLabel.classList.add(
        "calendar-month-day-box-week-label",
        "calendar-month-day-box-date-label",
        "calendar-month-week-label"
      );

      let dayLabel = document.createXULElement("label");
      dayLabel.setAttribute("data-label", "day");
      dayLabel.setAttribute("flex", "1");
      dayLabel.style.pointerEvents = "none";
      dayLabel.classList.add("calendar-month-day-box-date-label", "calendar-month-day-label");

      monthDayLabels.appendChild(weekLabel);
      monthDayLabels.appendChild(dayLabel);

      this.dayList = document.createElement("ol");
      this.dayList.classList.add("calendar-month-day-box-list");

      this.appendChild(monthDayLabels);
      this.appendChild(this.dayList);

      this.initializeAttributeInheritance();
    }

    get date() {
      return this.mDate;
    }

    set date(val) {
      this.setDate(val);
    }

    get selected() {
      let sel = this.getAttribute("selected");
      if (sel && sel == "true") {
        return true;
      }

      return false;
    }

    set selected(val) {
      if (val) {
        this.setAttribute("selected", "true");
        this.parentNode.setAttribute("selected", "true");
      } else {
        this.removeAttribute("selected");
        this.parentNode.removeAttribute("selected");
      }
    }

    get showMonthLabel() {
      return this.mShowMonthLabel;
    }

    set showMonthLabel(val) {
      if (this.mShowMonthLabel == val) {
        return;
      }
      this.mShowMonthLabel = val;

      if (!this.mDate) {
        return;
      }
      if (val) {
        this.setAttribute("value", cal.dtz.formatter.formatDateWithoutYear(this.mDate));
      } else {
        this.setAttribute("value", this.mDate.day);
      }
    }

    setDate(aDate) {
      // Remove all the old events.
      this.mItemHash = {};
      while (this.dayList.lastChild) {
        this.dayList.lastChild.remove();
      }

      if (this.mDate && aDate && this.mDate.compare(aDate) == 0) {
        return;
      }

      this.mDate = aDate;

      if (!aDate) {
        // Clearing out these attributes isn't strictly necessary but saves some confusion.
        this.removeAttribute("year");
        this.removeAttribute("month");
        this.removeAttribute("week");
        this.removeAttribute("day");
        this.removeAttribute("value");
        return;
      }

      // Set up DOM attributes for custom CSS coloring.
      let weekTitle = cal.getWeekInfoService().getWeekTitle(aDate);
      this.setAttribute("year", aDate.year);
      this.setAttribute("month", aDate.month + 1);
      this.setAttribute("week", weekTitle);
      this.setAttribute("day", aDate.day);

      if (this.mShowMonthLabel) {
        this.setAttribute("value", cal.dtz.formatter.formatDateWithoutYear(this.mDate));
      } else {
        this.setAttribute("value", aDate.day);
      }
    }

    addItem(aItem) {
      if (aItem.hashId in this.mItemHash) {
        this.removeItem(aItem);
      }

      let cssSafeId = cal.view.formatStringForCSSRule(aItem.calendar.id);
      let box = document.createXULElement("calendar-month-day-box-item");
      let context = this.getAttribute("item-context") || this.getAttribute("context");
      box.setAttribute("context", context);
      box.style.setProperty("--item-backcolor", `var(--calendar-${cssSafeId}-backcolor)`);
      box.style.setProperty("--item-forecolor", `var(--calendar-${cssSafeId}-forecolor)`);

      let listItemWrapper = document.createElement("li");
      listItemWrapper.classList.add("calendar-month-day-box-list-item");
      listItemWrapper.appendChild(box);
      cal.data.binaryInsertNode(
        this.dayList,
        listItemWrapper,
        aItem,
        cal.view.compareItems,
        false,
        // Access the calendar item from a list item wrapper.
        wrapper => wrapper.firstChild.item
      );

      box.calendarView = this.calendarView;
      box.item = aItem;
      box.parentBox = this;
      box.occurrence = aItem;

      this.mItemHash[aItem.hashId] = box;
      return box;
    }

    selectItem(aItem) {
      if (aItem.hashId in this.mItemHash) {
        this.mItemHash[aItem.hashId].selected = true;
      }
    }

    unselectItem(aItem) {
      if (aItem.hashId in this.mItemHash) {
        this.mItemHash[aItem.hashId].selected = false;
      }
    }

    removeItem(aItem) {
      if (aItem.hashId in this.mItemHash) {
        // Delete the list item wrapper.
        let node = this.mItemHash[aItem.hashId].parentNode;
        node.remove();
        delete this.mItemHash[aItem.hashId];
      }
    }

    setDropShadow(on) {
      let existing = this.dayList.querySelector(".dropshadow");
      if (on) {
        if (!existing) {
          // Insert an empty list item.
          let dropshadow = document.createElement("li");
          dropshadow.classList.add("dropshadow", "calendar-month-day-box-list-item");
          this.dayList.insertBefore(dropshadow, this.dayList.firstElementChild);
        }
      } else if (existing) {
        existing.remove();
      }
    }

    onDropItem(aItem) {
      // When item's timezone is different than the default one, the
      // item might get moved on a day different than the drop day.
      // Changing the drop day allows to compensate a possible difference.

      // Figure out if the timezones cause a days difference.
      let start = (
        aItem[cal.dtz.startDateProp(aItem)] || aItem[cal.dtz.endDateProp(aItem)]
      ).clone();
      let dayboxDate = this.mDate.clone();
      if (start.timezone != dayboxDate.timezone) {
        let startInDefaultTz = start.clone().getInTimezone(dayboxDate.timezone);
        start.isDate = true;
        startInDefaultTz.isDate = true;
        startInDefaultTz.timezone = start.timezone;
        let dayDiff = start.subtractDate(startInDefaultTz);
        // Change the day where to drop the item.
        dayboxDate.addDuration(dayDiff);
      }

      return cal.item.moveToDate(aItem, dayboxDate);
    }

    onMouseDown(event) {
      event.stopPropagation();
      if (this.mDate) {
        this.calendarView.selectedDay = this.mDate;
      }
    }

    onDblClick(event) {
      event.stopPropagation();
      this.calendarView.controller.createNewEvent();
    }

    onClick(event) {
      if (event.button != 0) {
        return;
      }

      if (!(event.ctrlKey || event.metaKey)) {
        this.calendarView.setSelectedItems([]);
      }
    }

    onWheel(event) {
      if (cal.view.getParentNodeOrThisByAttribute(event.target, "data-label", "day") == null) {
        if (this.dayList.scrollHeight > this.dayList.clientHeight) {
          event.stopPropagation();
        }
      }
    }
  }

  customElements.define("calendar-month-day-box", CalendarMonthDayBox);

  /**
   * The MozCalendarMonthDayBoxItem widget is used as event item in the
   * Multiweek and Month views of the calendar. It displays the event name,
   * alarm icon and the category type color.
   *
   * @extends {MozElements.MozCalendarEditableItem}
   */
  class MozCalendarMonthDayBoxItem extends MozElements.MozCalendarEditableItem {
    static get inheritedAttributes() {
      return {
        ".alarm-icons-box": "flashing",
      };
    }
    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }
      // NOTE: This is the same structure as EditableItem, except this has a
      // time label and we are missing the location-desc.
      this.appendChild(
        MozXULElement.parseXULToFragment(`
          <html:img class="item-type-icon" alt="" />
          <html:div class="item-time-label"></html:div>
          <html:div class="event-name-label"></html:div>
          <html:input class="plain event-name-input"
                      hidden="hidden"
                      placeholder='${cal.l10n.getCalString("newEvent")}' />
          <html:div class="alarm-icons-box"></html:div>
          <html:img class="item-classification-icon" />
          <html:div class="calendar-category-box"></html:div>
        `)
      );

      this.classList.add("calendar-color-box", "calendar-item-flex");

      // We have two event listeners for dragstart. This event listener is for the bubbling phase
      // where we are setting up the document.monthDragEvent which will be used in the event listener
      // in the capturing phase which is set up in the calendar-editable-item.
      this.addEventListener(
        "dragstart",
        event => {
          document.monthDragEvent = this;
        },
        true
      );

      this.style.pointerEvents = "auto";
      this.setAttribute("tooltip", "itemTooltip");
      this.addEventNameTextboxListener();
      this.initializeAttributeInheritance();
    }

    set occurrence(val) {
      cal.ASSERT(!this.mOccurrence, "Code changes needed to set the occurrence twice", true);
      this.mOccurrence = val;
      let labelTime;
      if (val.isEvent()) {
        let type;
        if (!val.startDate.isDate) {
          let timezone = this.calendarView ? this.calendarView.mTimezone : cal.dtz.defaultTimezone;
          let parentDate = this.parentBox.date;
          let parentTime = cal.createDateTime();
          parentTime.resetTo(parentDate.year, parentDate.month, parentDate.day, 0, 0, 0, timezone);
          let startTime = val.startDate.getInTimezone(timezone);
          let endTime = val.endDate.getInTimezone(timezone);
          let nextDay = parentTime.clone();
          nextDay.day++;
          let comp = endTime.compare(nextDay);
          if (startTime.compare(parentTime) == -1) {
            if (comp == 1) {
              type = "continue";
            } else if (comp == 0) {
              type = "start";
            } else {
              type = "end";
              labelTime = endTime;
            }
          } else if (comp == 1) {
            type = "start";
            labelTime = startTime;
          } else {
            labelTime = startTime;
          }
        }
        let icon = this.querySelector(".item-type-icon");
        icon.classList.toggle("rotated-to-read-direction", !!type);
        switch (type) {
          case "start":
            icon.setAttribute("src", "chrome://calendar/skin/shared/event-start.svg");
            document.l10n.setAttributes(icon, "calendar-editable-item-multiday-event-icon-start");
            break;
          case "continue":
            icon.setAttribute("src", "chrome://calendar/skin/shared/event-continue.svg");
            document.l10n.setAttributes(
              icon,
              "calendar-editable-item-multiday-event-icon-continue"
            );
            break;
          case "end":
            icon.setAttribute("src", "chrome://calendar/skin/shared/event-end.svg");
            document.l10n.setAttributes(icon, "calendar-editable-item-multiday-event-icon-end");
            break;
          default:
            icon.removeAttribute("src");
            icon.removeAttribute("data-l10n-id");
            icon.setAttribute("alt", "");
        }
      }
      let timeLabel = this.querySelector(".item-time-label");
      if (labelTime === undefined) {
        timeLabel.textContent = "";
        timeLabel.hidden = true;
      } else {
        let formatter = cal.dtz.formatter;
        timeLabel.textContent = formatter.formatTime(labelTime);
        timeLabel.hidden = false;
      }

      this.setEditableLabel();
      this.setCSSClasses();
    }

    get occurrence() {
      return this.mOccurrence;
    }
  }

  customElements.define("calendar-month-day-box-item", MozCalendarMonthDayBoxItem);

  /**
   * Abstract base class that is used for the month and multiweek calendar view custom elements.
   *
   * @implements {calICalendarView}
   * @extends {MozElements.CalendarBaseView}
   * @abstract
   */
  class CalendarMonthBaseView extends MozElements.CalendarBaseView {
    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasConnected) {
        return;
      }
      // this.hasConnected is set to true in super.connectedCallback.
      super.connectedCallback();

      this.appendChild(
        MozXULElement.parseXULToFragment(`
          <html:table class="mainbox monthtable">
            <html:thead>
              <html:tr></html:tr>
            </html:thead>
            <html:tbody class="monthbody"></html:tbody>
          </html:table>
        `)
      );

      this.addEventListener("wheel", event => {
        const pixelThreshold = 150;
        const scrollEnabled = Services.prefs.getBoolPref("calendar.view.mousescroll", true);
        if (!event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && scrollEnabled) {
          // In the month view, the only thing that can be scrolled
          // is the month the user is in. calendar-base-view takes care of
          // the shift key, so only move the view when no modifier is pressed.
          let deltaView = 0;
          if (event.deltaMode == event.DOM_DELTA_LINE) {
            if (event.deltaY != 0) {
              deltaView = event.deltaY < 0 ? -1 : 1;
            }
          } else if (event.deltaMode == event.DOM_DELTA_PIXEL) {
            this.mPixelScrollDelta += event.deltaY;
            if (this.mPixelScrollDelta > pixelThreshold) {
              deltaView = 1;
              this.mPixelScrollDelta = 0;
            } else if (this.mPixelScrollDelta < -pixelThreshold) {
              deltaView = -1;
              this.mPixelScrollDelta = 0;
            }
          }

          if (deltaView != 0) {
            this.moveView(deltaView);
          }
        }
      });

      this.mDateBoxes = null;
      this.mSelectedDayBox = null;

      this.mShowFullMonth = true;
      this.mShowWeekNumber = true;

      this.mShowDaysOutsideMonth = true;
      this.mClickedTime = null;

      let dayHeaderRow = this.querySelector("thead > tr");
      this.dayHeaders = new Array(7);
      for (let i = 0; i < 7; i++) {
        let hdr = document.createXULElement("calendar-day-label");
        let headerCell = document.createElement("th");
        headerCell.setAttribute("scope", "col");
        // NOTE: At the time of implementation, the natural columnheader role is
        // lost, probably from setting the CSS display of the container table
        // and row (Bug 1711273).
        // For now, we restore the role explicitly.
        headerCell.setAttribute("role", "columnheader");
        headerCell.appendChild(hdr);
        this.dayHeaders[i] = hdr;
        dayHeaderRow.appendChild(headerCell);
        hdr.weekDay = (i + this.weekStartOffset) % 7;
        hdr.shortWeekNames = false;
        hdr.style.gridRow = 1;
      }

      this.monthbody = this.querySelector(".monthbody");
      for (let week = 1; week <= 6; week++) {
        let weekRow = document.createElement("tr");
        for (let day = 1; day <= 7; day++) {
          let dayCell = document.createElement("td");
          let dayContent = document.createXULElement("calendar-month-day-box");
          dayCell.appendChild(dayContent);
          weekRow.appendChild(dayCell);
          // Set the grid row for the element. This is needed to ensure the
          // elements appear on different lines. We don't set the gridColumn
          // because some days may become hidden.
          dayContent.style.gridRow = week + 1;
        }
        this.monthbody.appendChild(weekRow);
      }

      // Set the preference for displaying the week number.
      this.mShowWeekNumber = Services.prefs.getBoolPref(
        "calendar.view-minimonth.showWeekNumber",
        true
      );
    }

    // calICalendarView Properties

    get supportsDisjointDates() {
      return false;
    }

    get hasDisjointDates() {
      return false;
    }

    get startDate() {
      return this.mStartDate;
    }

    get endDate() {
      return this.mEndDate;
    }

    set selectedDay(day) {
      if (this.mSelectedDayBox) {
        this.mSelectedDayBox.selected = false;
      }

      let realDay = day;
      if (!realDay.isDate) {
        realDay = day.clone();
        realDay.isDate = true;
      }
      const box = this.findDayBoxForDate(realDay);
      if (box) {
        box.selected = true;
        this.mSelectedDayBox = box;
      }
      this.fireEvent("dayselect", realDay);
    }

    get selectedDay() {
      if (this.mSelectedDayBox) {
        return this.mSelectedDayBox.date.clone();
      }

      return null;
    }

    // End calICalendarView Properties

    set selectedDateTime(dateTime) {
      this.mClickedTime = dateTime;
    }

    get selectedDateTime() {
      return cal.dtz.getDefaultStartDate(this.selectedDay);
    }

    set showFullMonth(showFullMonth) {
      this.mShowFullMonth = showFullMonth;
    }

    get showFullMonth() {
      return this.mShowFullMonth;
    }

    // This property may be overridden by subclasses if needed.
    set weeksInView(weeksInView) {}

    get weeksInView() {
      return 0;
    }

    // Whether to show days outside of the current month.
    set showDaysOutsideMonth(showDays) {
      if (this.mShowDaysOutsideMonth != showDays) {
        this.mShowDaysOutsideMonth = showDays;
        this.refresh();
      }
    }

    get showDaysOutsideMonth() {
      return this.mShowDaysOutsideMonth;
    }

    // calICalendarView Methods

    setSelectedItems(items, suppressEvent) {
      if (this.mSelectedItems.length) {
        for (const item of this.mSelectedItems) {
          const oldboxes = this.findDayBoxesForItem(item);
          for (const oldbox of oldboxes) {
            oldbox.unselectItem(item);
          }
        }
      }

      this.mSelectedItems = items || [];

      if (this.mSelectedItems.length) {
        for (const item of this.mSelectedItems) {
          const newboxes = this.findDayBoxesForItem(item);
          for (const newbox of newboxes) {
            newbox.selectItem(item);
          }
        }
      }

      if (!suppressEvent) {
        this.fireEvent("itemselect", this.mSelectedItems);
      }
    }

    centerSelectedItems() {}

    showDate(date) {
      if (date) {
        this.setDateRange(date.startOfMonth, date.endOfMonth);
        this.selectedDay = date;
      } else {
        // Refresh the selected day if it doesn't appear in the view.
        this.refresh();
      }
    }

    setDateRange(startDate, endDate) {
      this.rangeStartDate = startDate;
      this.rangeEndDate = endDate;

      const viewStart = cal
        .getWeekInfoService()
        .getStartOfWeek(startDate.getInTimezone(this.mTimezone));

      const viewEnd = cal.getWeekInfoService().getEndOfWeek(endDate.getInTimezone(this.mTimezone));

      viewStart.isDate = true;
      viewStart.makeImmutable();
      viewEnd.isDate = true;
      viewEnd.makeImmutable();

      this.mStartDate = viewStart;
      this.mEndDate = viewEnd;

      // Check values of tasksInView, workdaysOnly, showCompleted.
      // See setDateRange comment in calendar-multiday-base-view.js.
      let toggleStatus = 0;

      if (this.mTasksInView) {
        toggleStatus |= this.mToggleStatusFlag.TasksInView;
      }
      if (this.mWorkdaysOnly) {
        toggleStatus |= this.mToggleStatusFlag.WorkdaysOnly;
      }
      if (this.mShowCompleted) {
        toggleStatus |= this.mToggleStatusFlag.ShowCompleted;
      }

      // Update the navigation bar only when changes are related to the current view.
      if (this.isVisible()) {
        calendarNavigationBar.setDateRange(startDate, endDate);
      }

      // Check whether view range has been changed since last call to relayout().
      if (
        !this.mViewStart ||
        !this.mViewEnd ||
        this.mViewEnd.compare(viewEnd) != 0 ||
        this.mViewStart.compare(viewStart) != 0 ||
        this.mToggleStatus != toggleStatus
      ) {
        this.refresh();
      }
    }

    getDateList() {
      if (!this.mStartDate || !this.mEndDate) {
        return [];
      }

      const results = [];
      const curDate = this.mStartDate.clone();
      curDate.isDate = true;

      while (curDate.compare(this.mEndDate) <= 0) {
        results.push(curDate.clone());
        curDate.day += 1;
      }
      return results;
    }

    // End calICalendarView Methods

    /**
     * Set an attribute on the view element, and do re-layout if needed.
     *
     * @param {string} attr     The attribute to set.
     * @param {string} value    The value to set.
     */
    setAttribute(attr, value) {
      const needsRelayout = attr == "context" || attr == "item-context";

      const ret = XULElement.prototype.setAttribute.call(this, attr, value);

      if (needsRelayout) {
        this.relayout();
      }

      return ret;
    }

    /**
     * Handle preference changes. Typically called by a preference observer.
     *
     * @param {Object} subject       The subject, a prefs object.
     * @param {string} topic         The notification topic.
     * @param {string} preference    The preference to handle.
     */
    handlePreference(subject, topic, preference) {
      subject.QueryInterface(Ci.nsIPrefBranch);

      switch (preference) {
        case "calendar.previousweeks.inview":
          this.updateDaysOffPrefs();
          this.refreshView();
          break;

        case "calendar.week.start":
          // Refresh the view so the settings take effect.
          this.refreshView();
          break;

        case "calendar.weeks.inview":
          this.weeksInView = subject.getIntPref(preference);
          break;

        case "calendar.view-minimonth.showWeekNumber":
          this.mShowWeekNumber = subject.getBoolPref(preference);
          if (this.mShowWeekNumber) {
            this.refreshView();
          } else {
            this.hideWeekNumbers();
          }
          break;

        default:
          this.handleCommonPreference(subject, topic, preference);
          break;
      }
    }

    /**
     * Guarantee that the labels are clipped when an overflow occurs, to
     * prevent horizontal scrollbars from appearing briefly.
     */
    adjustWeekdayLength() {
      let dayLabels = this.querySelectorAll("calendar-day-label");
      if (!this.longWeekdayTotalPixels) {
        let maxDayWidth = 0;

        for (const label of dayLabels) {
          label.shortWeekNames = false;
          maxDayWidth = Math.max(maxDayWidth, label.getLongWeekdayPixels());
        }
        if (maxDayWidth > 0) {
          // FIXME: Where does the + 10 come from?
          this.longWeekdayTotalPixels = maxDayWidth * dayLabels.length + 10;
        } else {
          this.longWeekdayTotalPixels = 0;
        }
      }
      let useShortNames = this.longWeekdayTotalPixels > 0.95 * this.clientWidth;

      for (let label of dayLabels) {
        label.shortWeekNames = useShortNames;
      }
    }

    /**
     * Handle resizing by adjusting the view to the new size.
     *
     * @param {Element} viewElement    A calendar view element (calICalendarView).
     */
    onResize() {
      let { width, height } = this.getBoundingClientRect();
      if (width == this.mWidth && height == this.mHeight) {
        // Return early if we're still the previous size.
        return;
      }
      this.mWidth = width;
      this.mHeight = height;

      this.adjustWeekdayLength();
      // Delete the timer for the time indicator in day/week view.
      timeIndicator.cancel();
    }

    /**
     * Re-render the view.
     */
    relayout() {
      // Adjust headers based on the starting day of the week, if necessary.
      if (this.dayHeaders[0].weekDay != this.weekStartOffset) {
        for (let i = 0; i < this.dayHeaders.length; i++) {
          this.dayHeaders[i].weekDay = (i + this.weekStartOffset) % 7;
        }
      }

      if (this.mSelectedItems.length) {
        this.mSelectedItems = [];
      }

      if (!this.mStartDate || !this.mEndDate) {
        throw Components.Exception("", Cr.NS_ERROR_FAILURE);
      }

      // Days that are not in the main month on display are displayed with
      // a gray background.  Unless the month actually starts on a Sunday,
      // this means that mStartDate.month is 1 month less than the main month.
      let mainMonth = this.mStartDate.month;
      if (this.mStartDate.day != 1) {
        mainMonth++;
        mainMonth = mainMonth % 12;
      }

      const dateBoxes = [];
      const today = this.today();

      // This gets set to true, telling us to collapse the rest of the rows.
      let finished = false;
      const dateList = this.getDateList();

      // This allows finding the first column of dayboxes where to set the
      // week labels, taking into account whether days-off are displayed or not.
      let weekLabelColumnPos = -1;

      const rows = this.monthbody.children;

      // Iterate through each monthbody row and set up the day-boxes that
      // are its child nodes.  Remember, children is not a normal array,
      // so don't use the in operator if you don't want extra properties
      // coming out.
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        // If we've already assigned all of the day-boxes that we need, just
        // collapse the rest of the rows, otherwise expand them if needed.
        row.toggleAttribute("hidden", finished);
        if (finished) {
          for (let cell of row.cells) {
            // Clear out the hidden cells for to avoid holding events in memory
            // for no reason. Also prevents tests failing due to stray event
            // boxes from months that are no longer displayed.
            cell.firstElementChild.setDate();
          }
          continue;
        }
        for (let j = 0; j < row.children.length; j++) {
          const daybox = row.children[j].firstElementChild;
          const date = dateList[dateBoxes.length];

          // Remove the attribute "relation" for all the column headers.
          // Consider only the first row index otherwise it will be
          // removed again afterwards the correct setting.
          if (i == 0) {
            this.dayHeaders[j].removeAttribute("relation");
          }

          daybox.setAttribute("context", this.getAttribute("context"));

          daybox.setAttribute(
            "item-context",
            this.getAttribute("item-context") || this.getAttribute("context")
          );

          // Set the box-class depending on if this box displays a day in
          // the month being currently shown or not.
          let boxClass;
          if (this.showFullMonth) {
            boxClass =
              "calendar-month-day-box-" +
              (mainMonth == date.month ? "current-month" : "other-month");
          } else {
            boxClass = "calendar-month-day-box-current-month";
          }
          if (this.mDaysOffArray.some(dayOffNum => dayOffNum == date.weekday)) {
            boxClass = "calendar-month-day-box-day-off " + boxClass;
          }

          // Set up date relations.
          switch (date.compare(today)) {
            case -1:
              daybox.setAttribute("relation", "past");
              break;
            case 0:
              daybox.setAttribute("relation", "today");
              this.dayHeaders[j].setAttribute("relation", "today");
              break;
            case 1:
              daybox.setAttribute("relation", "future");
              break;
          }

          // Set up label with the week number in the first day of the row.
          if (this.mShowWeekNumber) {
            const weekLabel = daybox.querySelector("[data-label='week']");
            if (weekLabelColumnPos < 0) {
              const isDayOff = this.mDaysOffArray.includes((j + this.weekStartOffset) % 7);
              if (this.mDisplayDaysOff || !isDayOff) {
                weekLabelColumnPos = j;
              }
            }
            // Build and set the label.
            if (j == weekLabelColumnPos) {
              weekLabel.removeAttribute("hidden");
              const weekNumber = cal.getWeekInfoService().getWeekTitle(date);
              const weekString = cal.l10n.getCalString("multiweekViewWeek", [weekNumber]);
              weekLabel.value = weekString;
            } else {
              weekLabel.hidden = true;
            }
          }

          daybox.setAttribute("class", boxClass);

          daybox.calendarView = this;
          daybox.showMonthLabel = date.day == 1 || date.day == date.endOfMonth.day;
          daybox.date = date;
          dateBoxes.push(daybox);

          // If we've now assigned all of our dates, set this to true so we
          // know we can just collapse the rest of the rows.
          if (dateBoxes.length == dateList.length) {
            finished = true;
          }
        }
      }

      // If we're not showing a full month, then add a few extra labels to
      // help the user orient themselves in the view.
      if (!this.mShowFullMonth) {
        dateBoxes[0].showMonthLabel = true;
        dateBoxes[dateBoxes.length - 1].showMonthLabel = true;
      }

      // Store these, so that we can access them later.
      this.mDateBoxes = dateBoxes;
      this.hideDaysOff();

      this.adjustWeekdayLength();

      // Store the start and end of current view. Next time when
      // setDateRange is called, it will use mViewStart and mViewEnd to
      // check if view range has been changed.
      this.mViewStart = this.mStartDate;
      this.mViewEnd = this.mEndDate;

      // Store toggle status of current view.
      let toggleStatus = 0;

      if (this.mTasksInView) {
        toggleStatus |= this.mToggleStatusFlag.TasksInView;
      }
      if (this.mWorkdaysOnly) {
        toggleStatus |= this.mToggleStatusFlag.WorkdaysOnly;
      }
      if (this.mShowCompleted) {
        toggleStatus |= this.mToggleStatusFlag.ShowCompleted;
      }

      this.mToggleStatus = toggleStatus;
    }

    /**
     * Hide the week numbers.
     */
    hideWeekNumbers() {
      const rows = this.monthbody.children;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        for (let j = 0; j < row.children.length; j++) {
          const daybox = row.children[j].firstElementChild;
          const weekLabel = daybox.querySelector("[data-label='week']");
          weekLabel.hidden = true;
        }
      }
    }

    /**
     * Hide the days off.
     */
    hideDaysOff() {
      const rows = this.monthbody.children;

      const lastColNum = rows[0].children.length - 1;
      for (let colNum = 0; colNum <= lastColNum; colNum++) {
        const dayForColumn = (colNum + this.weekStartOffset) % 7;
        const dayOff = this.mDaysOffArray.includes(dayForColumn) && !this.mDisplayDaysOff;
        // Set the hidden attribute on the parentNode td.
        this.dayHeaders[colNum].parentNode.toggleAttribute("hidden", dayOff);
        for (let row of rows) {
          row.children[colNum].toggleAttribute("hidden", dayOff);
        }
      }
    }

    /**
     * Return the day box element for a given date.
     *
     * @param {calIDateTime} date    A date.
     * @return {?Element}            A `calendar-month-day-box` element.
     */
    findDayBoxForDate(date) {
      if (!this.mDateBoxes) {
        return null;
      }
      for (const box of this.mDateBoxes) {
        if (box.mDate.compare(date) == 0) {
          return box;
        }
      }
      return null;
    }

    /**
     * Return the day box elements for a given calendar item.
     *
     * @param {calIItemBase} item    A calendar item.
     * @return {Element[]}           An array of `calendar-month-day-box` elements.
     */
    findDayBoxesForItem(item) {
      let targetDate = null;
      let finishDate = null;
      const boxes = [];

      // All our boxes are in default time zone, so we need these times in them too.
      if (item.isEvent()) {
        targetDate = item.startDate.getInTimezone(this.mTimezone);
        finishDate = item.endDate.getInTimezone(this.mTimezone);
      } else if (item.isTodo()) {
        // Consider tasks without entry OR due date.
        if (item.entryDate || item.dueDate) {
          targetDate = (item.entryDate || item.dueDate).getInTimezone(this.mTimezone);
          finishDate = (item.dueDate || item.entryDate).getInTimezone(this.mTimezone);
        }
      }

      if (!targetDate) {
        return boxes;
      }

      if (!finishDate) {
        const maybeBox = this.findDayBoxForDate(targetDate);
        if (maybeBox) {
          boxes.push(maybeBox);
        }
        return boxes;
      }

      if (targetDate.compare(this.mStartDate) < 0) {
        targetDate = this.mStartDate.clone();
      }

      if (finishDate.compare(this.mEndDate) > 0) {
        finishDate = this.mEndDate.clone();
        finishDate.day++;
      }

      // Reset the time to 00:00, so that we really get all the boxes.
      targetDate.isDate = false;
      targetDate.hour = 0;
      targetDate.minute = 0;
      targetDate.second = 0;

      if (targetDate.compare(finishDate) == 0) {
        // We have also to handle zero length events in particular for
        // tasks without entry or due date.
        const box = this.findDayBoxForDate(targetDate);
        if (box) {
          boxes.push(box);
        }
      }

      while (targetDate.compare(finishDate) == -1) {
        const box = this.findDayBoxForDate(targetDate);

        // This might not exist if the event spans the view start or end.
        if (box) {
          boxes.push(box);
        }
        targetDate.day += 1;
      }

      return boxes;
    }

    /**
     * Display a calendar item.
     *
     * @param {calIItemBase} item    A calendar item.
     */
    doAddItem(item) {
      this.findDayBoxesForItem(item).forEach(box => box.addItem(item));
    }

    /**
     * Remove a calendar item so it is no longer displayed.
     *
     * @param {calIItemBase} item    A calendar item.
     */
    doRemoveItem(item) {
      const boxes = this.findDayBoxesForItem(item);

      if (!boxes.length) {
        return;
      }

      const oldLength = this.mSelectedItems.length;

      const isNotItem = a => a.hashId != item.hashId;
      this.mSelectedItems = this.mSelectedItems.filter(isNotItem);

      boxes.forEach(box => box.removeItem(item));

      // If a deleted event was selected, announce that the selection changed.
      if (oldLength != this.mSelectedItems.length) {
        this.fireEvent("itemselect", this.mSelectedItems);
      }
    }

    /**
     * Remove all items for a given calendar so they are no longer displayed.
     *
     * @param {calICalendar} calendar    A calendar object.
     */
    removeItemsFromCalendar(calendar) {
      if (!this.mDateBoxes) {
        return;
      }
      for (const box of this.mDateBoxes) {
        for (const id in box.mItemHash) {
          const node = box.mItemHash[id];
          const item = node.item;

          if (item.calendar.id == calendar.id) {
            box.removeItem(item);
          }
        }
      }
    }

    /**
     * Make a calendar item flash.  Used when an alarm goes off to make the related item flash.
     *
     * @param {Object} item    The calendar item to flash.
     * @param {boolean} stop        Whether to stop flashing that's already started.
     */
    flashAlarm(item, stop) {
      if (!this.initialized) {
        return;
      }

      const showIndicator = Services.prefs.getBoolPref("calendar.alarms.indicator.show", true);
      const totaltime = Services.prefs.getIntPref("calendar.alarms.indicator.totaltime", 3600);

      if (!stop && (!showIndicator || totaltime < 1)) {
        // No need to animate if the indicator should not be shown.
        return;
      }

      // Make sure the flashing attribute is set or reset on all visible boxes.
      const boxes = this.findDayBoxesForItem(item);
      for (const box of boxes) {
        for (const id in box.mItemHash) {
          const itemData = box.mItemHash[id];

          if (itemData.item.hasSameIds(item)) {
            if (stop) {
              itemData.removeAttribute("flashing");
            } else {
              itemData.setAttribute("flashing", "true");
            }
          }
        }
      }

      if (stop) {
        // We are done flashing, prevent newly created event boxes from flashing.
        delete this.mFlashingEvents[item.hashId];
      } else {
        // Set up a timer to stop the flashing after the total time.
        this.mFlashingEvents[item.hashId] = item;
        setTimeout(() => this.flashAlarm(item, true), totaltime);
      }
    }
  }

  MozElements.CalendarMonthBaseView = CalendarMonthBaseView;
}

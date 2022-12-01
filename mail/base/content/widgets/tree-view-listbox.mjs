/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

{
  const { JSTreeSelection } = ChromeUtils.import(
    "resource:///modules/JsTreeSelection.jsm"
  );

  // Animation variables for expanding and collapsing child lists.
  let reducedMotionMedia = matchMedia("(prefers-reduced-motion)");

  /**
   * Main tree view container that takes care of generating the main scrollable
   * DIV and the tree table.
   */
  class TreeView extends HTMLElement {
    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      this.classList.add("tree-view-scrollable-container");

      this.table = document.createElement("table", { is: "tree-view-table" });

      this.appendChild(this.table);
    }
  }
  customElements.define("tree-view", TreeView);

  /**
   * The main <table> element containing the thead and the TreeViewListbox
   * tbody. This class is used to expose all those methods and custom events
   * needed at the implementation level.
   */
  class TreeViewTable extends HTMLTableElement {
    /**
     * The array of objects containing the data to generate the needed columns.
     * Keep this public so child elements can access it if needed.
     * @type {Array}
     */
    columns;

    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      this.setAttribute("is", "tree-view-table");
      this.classList.add("tree-table");

      // Use a fragment to append child elements to later add them all at once
      // to the DOM. Performance is important.
      const fragment = new DocumentFragment();

      this.header = document.createElement("thead", {
        is: "tree-view-table-header",
      });
      fragment.append(this.header);

      this.spacerTop = document.createElement("tbody", {
        is: "tree-view-table-spacer",
      });
      fragment.append(this.spacerTop);

      this.listbox = document.createElement("tbody", {
        is: "tree-view-listbox",
      });
      fragment.append(this.listbox);

      this.spacerBottom = document.createElement("tbody", {
        is: "tree-view-table-spacer",
      });
      fragment.append(this.spacerBottom);

      this.append(fragment);
    }

    /**
     * If set to TRUE before generating the columns, the table will
     * automatically create a column picker in the table header.
     *
     * @type {boolean}
     */
    set editable(val) {
      this.dataset.editable = val;
    }

    get editable() {
      return this.dataset.editable === "true";
    }

    /**
     * Tracks if the rows of this table are selectable through a checkbox
     * column. Setting this to TRUE will automatically create a selection column
     * with checkboxes for every row element.
     *
     * @type {boolean}
     */
    set selectable(val) {
      this.dataset.selectable = val;
    }

    get selectable() {
      return this.dataset.selectable === "true";
    }

    /**
     * Set the id attribute of the TreeViewListbox for selection and styling
     * purpose.
     *
     * @param {string} id - The string ID to set.
     */
    setListBoxID(id) {
      this.listbox.id = id;
    }

    /**
     * Set the columns array of the table. This should only be used during
     * initialization and any following change to the columns visibility should
     * be handled via the updateColumns() method.
     *
     * @param {Array} columns - The array of columns to generate.
     */
    setColumns(columns) {
      this.columns = columns;
      this.header.setColumns();
      this.#updateView();
    }

    /**
     * Update the currently visible columns.
     *
     * @param {Array} columns - The array of columns to update. It should match
     * the original array set via the setColumn() method since this method will
     * only update the column visibility without generating new elements.
     */
    updateColumns(columns) {
      this.columns = columns;
      this.#updateView();
    }

    /**
     * Store the newly resized column values in the xul store.
     *
     * @param {string} url - The document URL used to store the values.
     * @param {DOMEvent} event - The dom event bubbling from the resized action.
     */
    setColumnsWidths(url, event) {
      const width = event.detail.splitter.width;
      const column = event.detail.column;
      const newValue = `${column}:${width}`;
      let newWidths;

      // Check if we already have stored values and update it if so.
      let columnsWidths = Services.xulStore.getValue(url, "columns", "widths");
      if (columnsWidths) {
        let updated = false;
        columnsWidths = columnsWidths.split(",");
        for (let index = 0; index < columnsWidths.length; index++) {
          const cw = columnsWidths[index].split(":");
          if (cw[0] == column) {
            cw[1] = width;
            updated = true;
            columnsWidths[index] = newValue;
            break;
          }
        }
        // Push the new value into the array if we didn't have an existing one.
        if (!updated) {
          columnsWidths.push(newValue);
        }
        newWidths = columnsWidths.join(",");
      } else {
        newWidths = newValue;
      }

      // Store the values as a plain string with the current format:
      //   columnID:width,columnID:width,...
      Services.xulStore.setValue(url, "columns", "widths", newWidths);
    }

    /**
     * Restore the previously saved widths of the various columns if we have
     * any.
     *
     * @param {string} url - The document URL used to store the values.
     */
    restoreColumnsWidths(url) {
      let columnsWidths = Services.xulStore.getValue(url, "columns", "widths");
      if (!columnsWidths) {
        return;
      }

      for (let column of columnsWidths.split(",")) {
        column = column.split(":");
        this.querySelector(`#${column[0]}`)?.style.setProperty(
          `--${column[0]}Splitter-width`,
          `${column[1]}px`
        );
      }
    }

    /**
     * Update the visibility of the currently available columns.
     */
    #updateView() {
      let visibleColumns = this.columns.filter(c => !c.hidden);

      for (let column of this.columns) {
        document.getElementById(column.id).hidden = column.hidden;

        // No need to update the splitter visibility if the column is
        // specifically not resizable.
        if (column.resizable === false) {
          continue;
        }

        document.getElementById(`${column.id}Splitter`).hidden =
          visibleColumns[visibleColumns.length - 1] == column
            ? true
            : column.hidden;
      }
    }
  }
  customElements.define("tree-view-table", TreeViewTable, { extends: "table" });

  /**
   * Class used to generate the thead of the TreeViewTable. This class will take
   * care of handling columns sizing and sorting order, with bubbling events to
   * allow listening for those changes on the implementation level.
   */
  class TreeViewTableHeader extends HTMLTableSectionElement {
    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      this.setAttribute("is", "tree-view-table-header");
      this.classList.add("tree-table-header");
      this.row = document.createElement("tr");
      this.appendChild(this.row);
    }

    /**
     * Create all the table header cells based on the currently set columns.
     */
    setColumns() {
      this.row.replaceChildren();

      // Create a checkbox column if the table is selectable.
      if (this.parentNode.selectable) {
        // TODO: Create the selection column.
      }

      for (let column of this.parentNode.columns) {
        let cell = document.createElement("th", {
          is: "tree-view-table-header-cell",
        });
        this.row.appendChild(cell);
        cell.setColumn(column);
      }

      // Create a column picker if the table is editable.
      if (this.parentNode.editable) {
        const picker = document.createElement("th", {
          is: "tree-view-table-column-picker",
        });
        this.row.appendChild(picker);
      }
    }
  }
  customElements.define("tree-view-table-header", TreeViewTableHeader, {
    extends: "thead",
  });

  /**
   * Class to generated the TH elements for the TreeViewTableHeader.
   */
  class TreeViewTableHeaderCell extends HTMLTableCellElement {
    /**
     * The div needed to handle the header button in an absolute position.
     * @type {HTMLElement}
     */
    #container;

    /**
     * The clickable button to change the sorting of the table.
     * @type {HTMLButtonElement}
     */
    #button;

    /**
     * If this cell is resizable.
     * @type {boolean}
     */
    #resizable = true;

    /**
     * If this cell can be clicked to affect the sorting order of the tree.
     * @type {boolean}
     */
    #sortable = true;

    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      this.setAttribute("is", "tree-view-table-header-cell");

      this.#container = document.createElement("div");
      this.#container.classList.add(
        "tree-table-cell",
        "tree-table-cell-container"
      );

      this.#button = document.createElement("button");
      this.#button.classList.add("button-flat");
      this.#container.appendChild(this.#button);
      this.appendChild(this.#container);
    }

    /**
     * Set the proper data to the newly generated table header cell and create
     * the needed child elements.
     *
     * @param {object} column - The column object with all the data to generate
     *   the correct header cell.
     */
    setColumn(column) {
      // Set a public ID so parent elements can loop through the available
      // columns after they're created.
      this.id = column.id;

      this.#button.id = `${column.id}Button`;
      if (column.l10n?.header) {
        document.l10n.setAttributes(this.#button, column.l10n.header);
      }
      this.#resizable = column.resizable ?? true;

      // Add a splitter if this is a resizable column.
      if (this.#resizable) {
        let splitter = document.createElement("hr", { is: "pane-splitter" });
        splitter.setAttribute("is", "pane-splitter");
        this.appendChild(splitter);
        splitter.resizeDirection = "horizontal";
        splitter.resizeElement = this;
        splitter.id = `${column.id}Splitter`;
        this.style.setProperty("width", `var(--${splitter.id}-width)`);
        // Emit a custom event after a resize action. Methods at implementation
        // level should listen to this event if the edited column size needs to
        // be stored or used.
        splitter.addEventListener("splitter-resized", () => {
          this.dispatchEvent(
            new CustomEvent("column-resized", {
              bubbles: true,
              detail: {
                splitter,
                column: column.id,
              },
            })
          );
        });
      }

      this.#sortable = column.sortable ?? true;
      this.hidden = column.hidden;

      // Make the button clickable if the column can trigger a sorting of rows.
      if (this.#sortable) {
        this.#button.addEventListener("click", () => {
          this.dispatchEvent(
            new CustomEvent("sort-changed", {
              bubbles: true,
              detail: {
                column: column.id,
              },
            })
          );
        });
      }
    }

    /**
     * Set this table header as responsible for the sorting of rows.
     *
     * @param {string["ascending"|"descending"]} direction - The new sorting
     *   direction.
     */
    setSorting(direction) {
      this.#button.classList.add("sorting", direction);
    }

    /**
     * If this current column can be resized.
     *
     * @type {boolean}
     */
    set resizable(val) {
      this.#resizable = val;
    }

    get resizable() {
      return this.#resizable;
    }

    /**
     * If the current column can trigger a sorting of rows.
     *
     * @type {boolean}
     */
    set sortable(val) {
      this.#sortable = val;
      this.#button.disabled = !val;
    }

    get sortable() {
      return this.#sortable;
    }
  }
  customElements.define(
    "tree-view-table-header-cell",
    TreeViewTableHeaderCell,
    { extends: "th" }
  );

  /**
   * Class used to generate a column picker used for the TreeViewTableHeader in
   * case the visibility of the columns of a table can be changed.
   *
   * Include treeView.ftl for strings.
   */
  class TreeViewTableColumnPicker extends HTMLTableCellElement {
    /**
     * The clickable button triggering the picker context menu.
     * @type {HTMLButtonElement}
     */
    #button;

    /**
     * The menupopup allowing users to show and hide columns.
     * @type {XULElement}
     */
    #context;

    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      this.setAttribute("is", "tree-view-table-column-picker");
      this.classList.add("tree-table-cell-container");

      this.#button = document.createElement("button");
      document.l10n.setAttributes(this.#button, "tree-list-view-column-picker");
      this.#button.classList.add("button-flat", "button-column-picker");
      this.appendChild(this.#button);

      const img = document.createElement("img");
      img.src = "";
      img.alt = "";
      this.#button.appendChild(img);

      this.#context = document.createXULElement("menupopup");
      this.#context.setAttribute("position", "bottomleft topleft");
      this.appendChild(this.#context);
      this.#context.addEventListener("popupshowing", () => {
        let columns = this.closest("table").columns;
        for (let column of columns) {
          let item = this.#context.querySelector(`[value="${column.id}"]`);
          if (!item) {
            continue;
          }

          if (!column.hidden) {
            item.setAttribute("checked", "true");
            continue;
          }

          item.removeAttribute("checked");
        }
      });

      this.#button.addEventListener("click", event => {
        this.#context.openPopup(event.target, { triggerEvent: event });
      });

      this.initColumns();
    }

    /**
     * Add all toggable columns to the context menu popup of the picker button.
     */
    initColumns() {
      let table = this.closest("table");
      let columns = table.columns;
      let items = new DocumentFragment();
      for (let column of columns) {
        let menuitem = document.createXULElement("menuitem");
        items.append(menuitem);
        menuitem.setAttribute("type", "checkbox");
        menuitem.setAttribute("name", "toggle");
        menuitem.setAttribute("value", column.id);
        menuitem.setAttribute("closemenu", "none");
        if (column.l10n?.menuitem) {
          document.l10n.setAttributes(menuitem, column.l10n.menuitem);
        }

        menuitem.addEventListener("command", () => {
          this.dispatchEvent(
            new CustomEvent("columns-changed", {
              bubbles: true,
              detail: {
                target: menuitem,
                value: column.id,
              },
            })
          );
        });
      }

      this.#context.appendChild(items);
    }
  }
  customElements.define(
    "tree-view-table-column-picker",
    TreeViewTableColumnPicker,
    { extends: "th" }
  );

  /**
   * A more powerful list designed to be used with a view (nsITreeView or
   * whatever replaces it in time) and be scalable to a very large number of
   * items if necessary. Multiple selections are possible and changes in the
   * connected view are cause updates to the list (provided `rowCountChanged`/
   * `invalidate` are called as appropriate).
   *
   * Rows are provided by a custom element that inherits from
   * TreeViewListrow below. Set the name of the custom element as the "rows"
   * attribute.
   *
   * Include tree-listbox.css for appropriate styling.
   */
  class TreeViewListbox extends HTMLTableSectionElement {
    static observedAttributes = ["rows"];

    /**
     * How many rows outside the visible area to keep in memory. We keep some
     * rows above and below those that are visible to avoid blank space
     * appearing when the user scrolls.
     *
     * @type {integer}
     */
    static OVERFLOW_BUFFER = 10;

    /**
     * Index of the first row that exists in the DOM.
     *
     * @type {integer}
     */
    _firstRowIndex = 0;

    /**
     * Index of the last row that exists in the DOM.
     *
     * @type {integer}
     */
    _lastRowIndex = 0;

    /**
     * Row indices mapped to the row elements that exist in the DOM.
     *
     * @type {Map(integer -> Element)}
     */
    _rows = new Map();

    /**
     * The current view.
     *
     * @type {nsITreeView}
     */
    _view = null;

    /**
     * The current selection.
     *
     * @type {nsITreeSelection}
     */
    _selection = null;

    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      this.tabIndex = 0;
      this.setAttribute("is", "tree-view-listbox");
      this.setAttribute("aria-multiselectable", "true");

      this.scrollable = this.closest(".tree-view-scrollable-container");

      this.addEventListener("focus", event => {
        if (this._preventFocusHandler) {
          this._preventFocusHandler = false;
          return;
        }
        if (this.currentIndex == -1 && this._view.rowCount) {
          let selectionChanged = false;
          if (this.selectedIndex == -1) {
            this._selection.select(0);
            selectionChanged = true;
          }
          this.currentIndex = this.selectedIndex;
          if (selectionChanged) {
            this.dispatchEvent(new CustomEvent("select"));
          }
        }
      });

      this.addEventListener("mousedown", event => {
        if (
          this == document.activeElement ||
          !event.target.closest(`tr[is="${this._rowElementName}"]`)
        ) {
          return;
        }
        // We prevent the focus handler because it can change the selection
        // state, which currently rebuilds the view. If this happens the mouseup
        // event will be on a different element, which means it will not receive
        // the "click" event.
        // Instead, we let the click handler change the selection state instead
        // of the focus handler.
        // Ideally, instead of this hack, we would not rebuild the view when
        // just the selection changes since it should be a light operation.
        this._preventFocusHandler = true;
        // We expect the property to be cleared in the focus handler, because
        // the default mousedown will invoke it, but we clear the property at
        // the next loop just in case.
        setTimeout(() => {
          this._preventFocusHandler = false;
        });
      });

      this.addEventListener("click", event => {
        if (event.button !== 0) {
          return;
        }

        let row = event.target.closest(`tr[is="${this._rowElementName}"]`);
        if (!row) {
          return;
        }

        let index = row.index;

        if (this._view.isContainer(index) && event.target.closest(".twisty")) {
          if (this._view.isContainerOpen(index)) {
            this.collapseRowAtIndex(index);
          } else {
            let addedRows = this.expandRowAtIndex(index);
            this.scrollToIndex(
              index +
                Math.min(
                  addedRows,
                  this.scrollable.clientHeight /
                    this._rowElementClass.ROW_HEIGHT -
                    1
                )
            );
          }
          return;
        }

        if (event.ctrlKey && event.shiftKey) {
          return;
        }

        if (event.ctrlKey) {
          this._toggleSelected(index);
        } else if (event.shiftKey) {
          this._selectRange(index);
        } else {
          this._selectSingle(index);
        }
      });

      this.addEventListener("keydown", event => {
        if (event.altKey || event.metaKey) {
          return;
        }

        let currentIndex = this.currentIndex == -1 ? 0 : this.currentIndex;
        let newIndex;
        switch (event.key) {
          case "ArrowUp":
            newIndex = currentIndex - 1;
            break;
          case "ArrowDown":
            newIndex = currentIndex + 1;
            break;
          case "ArrowLeft":
          case "ArrowRight": {
            event.preventDefault();
            if (this.currentIndex == -1) {
              return;
            }
            let isArrowRight = event.key == "ArrowRight";
            let isRTL = this.matches(":dir(rtl)");
            if (isArrowRight == isRTL) {
              // Collapse action.
              let currentLevel = this._view.getLevel(this.currentIndex);
              if (this._view.isContainerOpen(this.currentIndex)) {
                this.collapseRowAtIndex(this.currentIndex);
                return;
              } else if (currentLevel == 0) {
                return;
              }

              let parentIndex = this._view.getParentIndex(this.currentIndex);
              if (parentIndex != -1) {
                newIndex = parentIndex;
              }
            } else if (this._view.isContainer(this.currentIndex)) {
              // Expand action.
              if (!this._view.isContainerOpen(this.currentIndex)) {
                let addedRows = this.expandRowAtIndex(this.currentIndex);
                this.scrollToIndex(
                  this.currentIndex +
                    Math.min(
                      addedRows,
                      this.scrollable.clientHeight /
                        this._rowElementClass.ROW_HEIGHT -
                        1
                    )
                );
              } else {
                newIndex = this.currentIndex + 1;
              }
            }
            if (newIndex != undefined) {
              this._selectSingle(newIndex);
            }
            return;
          }
          case "Home":
            newIndex = 0;
            break;
          case "End":
            newIndex = this._view.rowCount - 1;
            break;
          case "PageUp":
            newIndex = Math.max(
              0,
              currentIndex -
                Math.floor(
                  this.scrollable.clientHeight /
                    this._rowElementClass.ROW_HEIGHT
                )
            );
            break;
          case "PageDown":
            newIndex = Math.min(
              this._view.rowCount - 1,
              currentIndex +
                Math.floor(
                  this.scrollable.clientHeight /
                    this._rowElementClass.ROW_HEIGHT
                )
            );
            break;
        }

        if (newIndex != undefined) {
          newIndex = this._clampIndex(newIndex);
          if (newIndex != null && (!event.ctrlKey || !event.shiftKey)) {
            // Else, if both modifiers pressed, do nothing.
            if (event.shiftKey) {
              this._selectRange(newIndex);
            } else if (event.ctrlKey) {
              // Change focus, but not selection.
              this.currentIndex = newIndex;
            } else {
              this._selectSingle(newIndex);
            }
          }
          event.preventDefault();
          return;
        }

        if (event.key == " ") {
          if (this.currentIndex != -1 && !event.shiftKey) {
            if (event.ctrlKey) {
              this._toggleSelected(this.currentIndex);
            } else {
              this._selectSingle(this.currentIndex);
            }
          }
          event.preventDefault();
        }
      });

      let lastTime = 0;
      let timer = null;
      this.scrollable.addEventListener("scroll", () => {
        if (reducedMotionMedia.matches) {
          this._ensureVisibleRowsAreDisplayed();
          return;
        }

        let now = Date.now();
        let diff = now - lastTime;

        if (diff > 100) {
          this._ensureVisibleRowsAreDisplayed();
          lastTime = now;
        } else if (!timer) {
          timer = setTimeout(() => {
            this._ensureVisibleRowsAreDisplayed();
            lastTime = now;
            timer = null;
          }, 100 - diff);
        }
      });

      window.addEventListener("load", this);
      window.addEventListener("resize", this);
    }

    disconnectedCallback() {
      for (let row of this._rows.values()) {
        row.remove();
      }
      this._rows.clear();

      while (this.lastChild) {
        this.lastChild.remove();
      }

      window.removeEventListener("load", this);
      window.removeEventListener("resize", this);
    }

    handleEvent(event) {
      switch (event.type) {
        case "load":
        case "resize":
          this._ensureVisibleRowsAreDisplayed();
          break;
      }
    }

    attributeChangedCallback(name, oldValue, newValue) {
      this._rowElementName = newValue || "tree-view-listrow";
      this._rowElementClass = customElements.get(this._rowElementName);

      if (this._view) {
        this.invalidate();
      }
    }

    /**
     * The current view for this list.
     *
     * @type {nsITreeView}
     */
    get view() {
      return this._view;
    }

    set view(view) {
      this._selection = null;
      if (this._view) {
        this._view.setTree(null);
        this._view.selection = null;
      }
      if (this._selection) {
        this._selection.view = null;
      }

      this._view = view;
      if (view) {
        try {
          this._selection = new JSTreeSelection();
          this._selection.tree = this;
          this._selection.view = view;

          view.selection = this._selection;
          view.setTree(this);
        } catch (ex) {
          // This isn't a XULTreeElement, and we can't make it one, so if the
          // `setTree` call crosses XPCOM, an exception will be thrown.
          if (ex.result != Cr.NS_ERROR_XPC_BAD_CONVERT_JS) {
            throw ex;
          }
        }
      }
      this.invalidate();

      this.dispatchEvent(new CustomEvent("viewchange"));
    }

    /**
     * Set the colspan of the spacer row cells.
     *
     * @param {int} count - The amount of visible columns.
     */
    setSpacersColspan(count) {
      // Add an extra column if the table is editable to account for the column
      // picker column.
      if (this.parentNode.editable) {
        count++;
      }
      this.parentNode.spacerTop.setColspan(count);
      this.parentNode.spacerBottom.setColspan(count);
    }

    /**
     * Clear all rows from the list and create them again.
     */
    invalidate() {
      for (let row of this._rows.values()) {
        row.remove();
      }
      this._rows.clear();
      this._firstRowIndex = 0;
      this._lastRowIndex = 0;

      // Temporarily set the height of the spacerBottom to account for the full
      // height of the entire table to prevent the list from visually jumping
      // up and down during rebuild.
      let rowCount = this._view ? this._view.rowCount : 0;
      this.parentNode.spacerBottom.setHeight(
        rowCount * this._rowElementClass.ROW_HEIGHT
      );
      this._ensureVisibleRowsAreDisplayed();
    }

    /**
     * Invalidate the row at `index` in place. If `index` refers to a row that
     * should exist but doesn't (because the row count increased), adds a row.
     * If `index` refers to a row that does exist but shouldn't (because the
     * row count decreased), removes it.
     *
     * @param {integer} index
     */
    invalidateRow(index) {
      let row = this.getRowAtIndex(index);
      if (row) {
        if (index >= this._view.rowCount) {
          row.remove();
          this._rows.delete(index);
        } else {
          row.index = index;
          row.selected = this._selection.isSelected(index);
        }
      } else if (index >= this._firstRowIndex && index <= this._lastRowIndex) {
        this._addRowAtIndex(index);
      }
    }

    /**
     * Fills the view with rows at the current scroll position. Also creates
     * `OVERFLOW_BUFFER` rows above and below the visible rows. Performance
     * here is important.
     */
    _ensureVisibleRowsAreDisplayed() {
      if (!this.view || this.view.rowCount == 0) {
        return;
      }

      let first = Math.max(
        0,
        Math.floor(
          this.scrollable.scrollTop / this._rowElementClass.ROW_HEIGHT
        ) - this.constructor.OVERFLOW_BUFFER
      );
      let last = Math.min(
        this._view.rowCount - 1,
        Math.floor(
          (this.scrollable.scrollTop + this.scrollable.clientHeight) /
            this._rowElementClass.ROW_HEIGHT
        ) + this.constructor.OVERFLOW_BUFFER
      );

      this.parentNode.spacerTop.setHeight(
        first * this._rowElementClass.ROW_HEIGHT
      );

      for (
        let i = this._firstRowIndex - 1, iTo = Math.max(first, 0);
        i >= iTo;
        i--
      ) {
        this._addRowAtIndex(i, this.firstElementChild);
      }
      if (this._lastRowIndex == 0 && this.childElementCount == 0) {
        // Special case for first call.
        this._addRowAtIndex(0);
      }
      for (
        let i = this._lastRowIndex + 1,
          iTo = Math.min(last + 1, this._view.rowCount);
        i < iTo;
        i++
      ) {
        this._addRowAtIndex(i);
      }

      let firstActualRow = this.getRowAtIndex(first);
      let row = firstActualRow.previousElementSibling;
      while (row) {
        row.remove();
        this._rows.delete(row.index);
        row = firstActualRow.previousElementSibling;
      }

      let lastActualRow = this.getRowAtIndex(last);
      row = lastActualRow.nextElementSibling;
      while (lastActualRow.nextElementSibling) {
        row.remove();
        this._rows.delete(row.index);
        row = lastActualRow.nextElementSibling;
      }

      this._firstRowIndex = first;
      this._lastRowIndex = last;

      let rowCount = this._view ? this._view.rowCount : 0;
      this.parentNode.spacerBottom.setHeight(
        (rowCount - last - 1) * this._rowElementClass.ROW_HEIGHT
      );
    }

    /**
     * Index of the first visible or partly visible row.
     *
     * @returns {integer}
     */
    getFirstVisibleIndex() {
      return Math.ceil(
        this.scrollable.scrollTop / this._rowElementClass.ROW_HEIGHT
      );
    }

    /**
     * Ensures that the row at `index` is on the screen.
     *
     * @param {integer} index
     */
    scrollToIndex(index) {
      const topIndex = this._rowElementClass.ROW_HEIGHT * index;
      const { scrollTop, clientHeight } = this.scrollable;

      if (topIndex < scrollTop) {
        this.scrollable.scrollTo(0, topIndex);
        return;
      }

      const bottomIndex = topIndex + this._rowElementClass.ROW_HEIGHT * 3;
      if (bottomIndex > scrollTop + clientHeight) {
        this.scrollable.scrollTo(0, bottomIndex - clientHeight);
      }
    }

    /**
     * Updates the list to reflect added or removed rows.
     *
     * @param {integer} index
     */
    rowCountChanged(index, delta) {
      this._selection.adjustSelection(index, delta);
      this.dispatchEvent(new CustomEvent("rowcountchange"));
    }

    /**
     * Clamps `index` to a value between 0 and `rowCount - 1`.
     *
     * @param {integer} index
     * @returns {integer}
     */
    _clampIndex(index) {
      if (!this._view.rowCount) {
        return null;
      }
      if (index < 0) {
        return 0;
      }
      if (index >= this._view.rowCount) {
        return this._view.rowCount - 1;
      }
      return index;
    }

    /**
     * Creates a new row element and adds it to the DOM.
     *
     * @param {integer} index
     */
    _addRowAtIndex(index, before = null) {
      let element = document.createElement("tr", { is: this._rowElementName });
      element.setAttribute("is", this._rowElementName);
      let row = this.insertBefore(element, before);
      row.setAttribute("role", "option");
      row.setAttribute("aria-setsize", this._view.rowCount);
      row.style.height = `${this._rowElementClass.ROW_HEIGHT}px`;
      if (this._selection.isSelected(index)) {
        row.selected = true;
      }
      if (this.currentIndex === index) {
        row.classList.add("current");
      }
      row.index = index;
      this._rows.set(index, row);
    }

    /**
     * Returns the row element at `index` or null if `index` is out of range.
     *
     * @param {integer} index
     * @returns {HTMLLIElement}
     */
    getRowAtIndex(index) {
      return this._rows.get(index) ?? null;
    }

    /**
     * Collapses the row at `index` if it can be collapsed. If the selected
     * row is a descendant of the collapsing row, selection is moved to the
     * collapsing row.
     *
     * @param {integer} index
     */
    collapseRowAtIndex(index) {
      if (!this._view.isContainerOpen(index)) {
        return;
      }

      // If the selected row is going to be collapsed, move the selection.
      let selectedIndex = this.selectedIndex;
      while (selectedIndex > index) {
        selectedIndex = this._view.getParentIndex(selectedIndex);
        if (selectedIndex == index) {
          this.selectedIndex = index;
          break;
        }
      }

      // Check if the view calls rowCountChanged. If it didn't, we'll have to
      // call it. This can happen if the view has no reference to the tree.
      let rowCountDidChange = false;
      let rowCountChangeListener = () => {
        rowCountDidChange = true;
      };

      let countBefore = this._view.rowCount;
      this.addEventListener("rowcountchange", rowCountChangeListener);
      this._view.toggleOpenState(index);
      this.removeEventListener("rowcountchange", rowCountChangeListener);
      let countAdded = this._view.rowCount - countBefore;

      // Call rowCountChanged, if it hasn't already happened.
      if (countAdded && !rowCountDidChange) {
        this.invalidateRow(index);
        this.rowCountChanged(index + 1, countAdded);
      }

      this.dispatchEvent(
        new CustomEvent("collapsed", { bubbles: true, detail: index })
      );
    }

    /**
     * Expands the row at `index` if it can be expanded.
     *
     * @param {integer} index
     * @returns {integer} - the number of rows that were added
     */
    expandRowAtIndex(index) {
      if (!this._view.isContainer(index) || this._view.isContainerOpen(index)) {
        return 0;
      }

      // Check if the view calls rowCountChanged. If it didn't, we'll have to
      // call it. This can happen if the view has no reference to the tree.
      let rowCountDidChange = false;
      let rowCountChangeListener = () => {
        rowCountDidChange = true;
      };

      let countBefore = this._view.rowCount;
      this.addEventListener("rowcountchange", rowCountChangeListener);
      this._view.toggleOpenState(index);
      this.removeEventListener("rowcountchange", rowCountChangeListener);
      let countAdded = this._view.rowCount - countBefore;

      // Call rowCountChanged, if it hasn't already happened.
      if (countAdded && !rowCountDidChange) {
        this.invalidateRow(index);
        this.rowCountChanged(index + 1, countAdded);
      }

      this.dispatchEvent(
        new CustomEvent("expanded", { bubbles: true, detail: index })
      );

      return countAdded;
    }

    /**
     * In a selection, index of the most-recently-selected row.
     *
     * @type {integer}
     */
    get currentIndex() {
      return this._selection.currentIndex;
    }

    set currentIndex(index) {
      if (!this._view) {
        return;
      }

      for (let row of this.querySelectorAll(
        `tr[is="${this._rowElementName}"].current`
      )) {
        row.classList.remove("current");
      }

      this._selection.currentIndex = index;

      if (index < 0 || index > this._view.rowCount - 1) {
        this.removeAttribute("aria-activedescendant");
        return;
      }

      this.getRowAtIndex(index)?.classList.add("current");
      this.scrollToIndex(index);
      this.setAttribute("aria-activedescendant", `${this.id}-row${index}`);
    }

    /**
     * Select and focus the given index.
     *
     * @param {number} index - The index to select.
     */
    _selectSingle(index) {
      let changeSelection =
        this._selection.count != 1 || !this._selection.isSelected(index);
      // Update the JSTreeSelection selection to trigger a tree invalidate().
      if (changeSelection) {
        this._selection.select(index);
      }
      this.currentIndex = index;
      if (changeSelection) {
        this.dispatchEvent(new CustomEvent("select"));
      }
    }

    /**
     * Start or extend a range selection to the given index and focus it.
     *
     * @param {number} index - The index to select.
     */
    _selectRange(index) {
      this._selection.rangedSelect(-1, index, false);
      this.currentIndex = index;
      this.dispatchEvent(new CustomEvent("select"));
    }

    /**
     * Toggle the selection state at the given index and focus it.
     *
     * @param {number} index - The index to toggle.
     */
    _toggleSelected(index) {
      this._selection.toggleSelect(index);
      // We hack the internals of the JSTreeSelection to clear the
      // shiftSelectPivot.
      this._selection._shiftSelectPivot = null;
      this.currentIndex = index;
      this.dispatchEvent(new CustomEvent("select"));
    }

    /**
     * In a selection, index of the most-recently-selected row.
     *
     * @type {integer}
     */
    get selectedIndex() {
      if (!this._selection?.count) {
        return -1;
      }

      let min = {};
      this._selection.getRangeAt(0, min, {});
      return min.value;
    }

    set selectedIndex(index) {
      this._selectSingle(index);
    }

    /**
     * An array of the indices of all selected rows.
     *
     * @type {integer[]}
     */
    get selectedIndices() {
      let indices = [];
      let rangeCount = this._selection.getRangeCount();

      for (let range = 0; range < rangeCount; range++) {
        let min = {};
        let max = {};
        this._selection.getRangeAt(range, min, max);

        if (min.value == -1) {
          continue;
        }

        for (let index = min.value; index <= max.value; index++) {
          indices.push(index);
        }
      }

      return indices;
    }

    set selectedIndices(indices) {
      this._selection.clearSelection();
      for (let index of indices) {
        this._selection.toggleSelect(index);
      }
      this.dispatchEvent(new CustomEvent("select"));
    }

    /**
     * Changes the selection state of the row at `index`.
     *
     * @param {integer} index
     * @param {boolean?} selected - if set, set the selection state to this
     *   value, otherwise toggle the current state
     * @param {boolean?} suppressEvent - prevent a "select" event firing
     * @returns {boolean} - if the index is now selected
     */
    toggleSelectionAtIndex(index, selected, suppressEvent) {
      let wasSelected = this._selection.isSelected(index);
      if (selected === undefined) {
        selected = !wasSelected;
      }

      if (selected != wasSelected) {
        this._selection.toggleSelect(index);

        if (!suppressEvent) {
          this.dispatchEvent(new CustomEvent("select"));
        }
      }

      return selected;
    }
  }
  customElements.define("tree-view-listbox", TreeViewListbox, {
    extends: "tbody",
  });

  /**
   * Base class for rows in a TreeViewListbox. Rows have a fixed height and
   * their position on screen is managed by the owning list.
   *
   * Sub-classes should override ROW_HEIGHT, styles, and fragment to suit the
   * intended layout. The index getter/setter should be overridden to fill the
   * layout with values.
   */
  class TreeViewListrow extends HTMLTableRowElement {
    /**
     * Fixed height of this row. Rows in the list will be spaced this far
     * apart. This value must not change at runtime.
     *
     * @type {integer}
     */
    static ROW_HEIGHT = 50;

    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      this.list = this.parentNode;
      this.view = this.list.view;
      this.setAttribute("aria-selected", !!this.selected);
    }

    /**
     * The 0-based position of this row in the list. Override this setter to
     * fill layout based on values from the list's view. Always call back to
     * this class's getter/setter when inheriting.
     *
     * @type {integer}
     */
    get index() {
      return this._index;
    }

    set index(index) {
      this.setAttribute("aria-posinset", index + 1);
      this.id = `${this.list.id}-row${index}`;
      this.classList.toggle("children", this.view.isContainer(index));
      this.classList.toggle("collapsed", !this.view.isContainerOpen(index));
      this._index = index;
    }

    /**
     * Tracks the selection state of the current row.
     *
     * @type {boolean}
     */
    get selected() {
      return this.classList.contains("selected");
    }

    set selected(selected) {
      this.setAttribute("aria-selected", !!selected);
      this.classList.toggle("selected", !!selected);
    }
  }
  customElements.define("tree-view-listrow", TreeViewListrow, {
    extends: "tr",
  });

  /**
   * Class used to generate the td cell for the rows of TreeViewListbox.
   */
  class TreeViewTableCell extends HTMLTableCellElement {
    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;
      this.setAttribute("is", "tree-view-table-cell");
    }

    /**
     * Add a text string to this table cell.
     *
     * @param {string} val - The text string to add.
     */
    setText(val) {
      this.replaceChildren();
      this.textContent = val;
    }

    /**
     * Replaces all existing child elements with the new data.
     *
     * @param {HTMLElement} element - The element to add as child.
     */
    setContent(element) {
      this.replaceChildren(element);
    }
  }
  customElements.define("tree-view-table-cell", TreeViewTableCell, {
    extends: "td",
  });

  /**
   * Simple tbody spacer used above and below the main listbox tbody for space
   * allocation and ensuring the correct scrollable height.
   */
  class TreeViewTableSpacer extends HTMLTableSectionElement {
    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      this.cell = document.createElement("td");
      const row = document.createElement("tr");
      row.appendChild(this.cell);
      this.appendChild(row);
    }

    /**
     * Set the cell colspan to reflect the number of visible columns in order
     * to generate a correct HTML markup.
     *
     * @param {int} count - The columns count.
     */
    setColspan(count) {
      this.cell.setAttribute("colspan", count);
    }

    /**
     * Set the height of the cell in order to occupy the empty area that will
     * be filled by new rows on demand when needed.
     *
     * @param {int} val - The pixel height the row should occupy.
     */
    setHeight(val) {
      this.cell.style.height = `${val}px`;
    }
  }
  customElements.define("tree-view-table-spacer", TreeViewTableSpacer, {
    extends: "tbody",
  });
}

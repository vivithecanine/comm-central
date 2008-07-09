/* ***** BEGIN LICENSE BLOCK *****
 *   Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 * 
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Thunderbird Global Database.
 *
 * The Initial Developer of the Original Code is
 * Mozilla Messaging, Inc.
 * Portions created by the Initial Developer are Copyright (C) 2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Andrew Sutherland <asutherland@asutherland.org>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 * 
 * ***** END LICENSE BLOCK ***** */
 
EXPORTED_SYMBOLS = ['Gloda'];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import("resource://gloda/modules/log4moz.js");

Cu.import("resource://gloda/modules/datastore.js");
Cu.import("resource://gloda/modules/datamodel.js");
Cu.import("resource://gloda/modules/utils.js");


let Gloda = {
  _init: function gloda_ns_init() {
    this._initLogging();
    GlodaDatastore._init();
    this._initAttributes();
  },
  
  _log: null,
  _initLogging: function gloda_ns_initLogging() {
    let formatter = new Log4Moz.BasicFormatter();
    let root = Log4Moz.Service.rootLogger;
    root.level = Log4Moz.Level.Debug;

    let capp = new Log4Moz.ConsoleAppender(formatter);
    capp.level = Log4Moz.Level.Warn;
    root.addAppender(capp);

    let dapp = new Log4Moz.DumpAppender(formatter);
    dapp.level = Log4Moz.Level.All;
    root.addAppender(dapp);
    
    this._log = Log4Moz.Service.getLogger("gloda.NS");
    this._log.info("Logging Initialized");
  },
  
  getMessageForHeader: function gloda_ns_getMessageForHeader(aMsgHdr) {
    let message = GlodaDatastore.getMessageFromLocation(aMsgHdr.folder.URI,
                                                        aMsgHdr.messageKey);
    if (message == null) {
      message = GlodaDatastore.getMessageByMessageID(aMsgHdr.messageId);
      this._log.warn("Fell back to locating message by id; actual message " +
                     "key is: " + aMsgHdr.messageKey + " database key: " +
                     message.messageKey);
    }
    
    return message;
  },
  
  /**
   * Given a full mail address (ex: "Bob Smith" <bob@smith.com>), return the
   *  identity that corresponds to that mail address, creating it if required.
   */
  getIdentitiesForFullMailAddresses:
      function gloda_ns_getIdentitiesForMailAddresses(aMailAddresses) {
    let parsed = GlodaUtils.parseMailAddresses(aMailAddresses);
    
    let identities = [];
    for (let iAddress=0; iAddress < parsed.count; iAddress++) {
      let identity = GlodaDatastore.getIdentity("email",
                                                parsed.addresses[iAddress]);
      
      if (identity == null) {
        // we must create a contact
        let contact = GlodaDatastore.createContact(null, null,
                                                   parsed.names[iAddress]);
        
        // we must create the identity.  use a blank description because there's
        //  nothing to differentiate it from other identities, as this contact
        //  only has one initially (us).
        identity = GlodaDatastore.createIdentity(contact.id, contact, "email",
                                                 parsed.addresses[iAddress],
                                                 "");
      }
      identities.push(identity);
    }
    
    return identities;
  },
  
  getIdentityForFullMailAddress:
      function gloda_ns_getIdentityForFullMailAddress(aMailAddress) {
    let identities = this.getIdentitiesForFullMailAddresses(aMailAddress);
    if (identities.length != 1) {
      this._log.error("Expected exactly 1 address, got " + identities.length +
                      " for address: " + aMailAddress);
      return null;
    }    
    
    return identities[0];
  },
  
  kAttrFundamental: 0,
  kAttrOptimization: 1,
  kAttrDerived: 2,
  kAttrExplicit: 3,
  kAttrImplicit: 4,
  
  kSingular: 0,
  kMultiple: 1,
  
  BUILT_IN: "built-in",
  
  NOUN_BOOLEAN: 1,
  /** A date, encoded as a PRTime */
  NOUN_DATE: 10,
  NOUN_TAG: 50,
  NOUN_CONVERSATION: 101,
  NOUN_MESSAGE: 102,
  NOUN_CONTACT: 103,
  NOUN_IDENTITY: 104,
  
  /** Attribute providers in the sequence to process them. */
  _attrProviderOrder: [],
  /** Maps attribute providers to the list of attributes they provide */
  _attrProviders: {},
  
  _nounToClass: {},
  
  _initAttributes: function gloda_ns_initAttributes() {
    this._nounToClass[this.NOUN_BOOLEAN] = {class: Boolean,
      coerce: function(aVal) { if(aVal != 0) return true; else return false; }}; 
    this._nounToClass[this.NOUN_DATE] = {class: Date,
      coerce: function(aPRTime) {return new Date(aPRTime / 1000); }};

    // TODO: implement GlodaTag or some other abstraction 
    this._nounToClass[this.NOUN_TAG] = {class: GlodaTag,
      coerce: null};
       
    // TODO: use some form of (weak) caching layer... it is reasonably likely
    //  that there will be a high degree of correlation in many cases, and
    //  unless the UI is extremely clever and does its cleverness before
    //  examining the data, we will probably hit the correlation.
    this._nounToClass[this.NOUN_CONVERSATION] = {class: GlodaConversation,
      coerce: function(aID) { return GlodaDatastore.getConversationByID(aID);}};
    this._nounToClass[this.NOUN_MESSAGE] = {class: GlodaMessage,
      coerce: function(aID) { return GlodaDatastore.getMessageByID(aID); }};
    this._nounToClass[this.NOUN_CONTACT] = {class: GlodaContact,
      coerce: function(aID) { return GlodaDatastore.getContactByID(aID); }};
    this._nounToClass[this.NOUN_IDENTITY] = {class: GlodaIdentity,
      coerce: function(aID) { return GlodaDatastore.getIdentityByID(aID); }};
  
    GlodaDatastore.getAllAttributes();
  },
  
  
  _bindAttribute: function gloda_ns_bindAttr(aAttr, aSubjectType, aObjectType,
                                             aSingular, aBindName) {
    if (!(aSubjectType in this._nounToClass))
      throw Error("Invalid subject type: " + aSubjectType);
    
    let objectCoerce = this._nounToClass[aObjectType].coerce;
    
    let storageName = "__" + aBindName;
    let getter;
    // should we memoize the value as a getter per-instance?
    if (aSingular == Gloda.kSingular) {
      getter = function() {
        if (this[storageName] != undefined)
          return this[storageName];
        let instances = this.getAttributeInstances(aAttr);
        let val;
        if (instances.length > 0)
          val = objectCoerce(instances[0][2]);
        else
          val = null;
        this[storageName] = val;
        return val;
      }
    } else {
      getter = function() {
        if (this[storageName] != undefined)
          return this[storageName];
        let instances = this.getAttributeInstances(aAttr);
        let values;
        if (instances.length > 0) {
          for (let iInst=0; iInst < instances.length; iInst++) {
            values.push(objectCoerce(instances[iInst][2]));
          }
        }
        else {
          values = instances; // empty is empty
        }
        this[storageName] = values;
        return values;
      }
    }
  
    let subjectProto = this._nounToClass[aSubjectType].class.prototype;
    subjectProto.__defineGetter__(aBindName, getter);
    // no setters for now; manipulation comes later, and will require the attr
    //  definer to provide the actual logic, since we need to affect reality,
    //  not just the data-store.  we may also just punt that all off onto
    //  STEEL...
  },
  
  /**
   * @param aProvider
   * @param aAttrType
   * @param aPluginName
   * @param aAttrName
   * @param aSingular Is the attribute going to happen at most once (kSingular),
   *     or potentially multiple times (kMultiple).  This affects whether
   *     the binding (as defined by aBindName) returns a list or just a single
   *     item.
   * @param aSubjectType
   * @param aObjectType
   * @param aBindName The name to which to bind the attribute on the underlying
   *     data model object.  For example, for an aObjectType of NOUN_MESSAGE
   *     with an aBindName of "date", we will create a getter on GlodaMessage so
   *     that message.date returns the value of the date attribute (with the
   *     specific return type depending on what was passed for 
   * @param aParameterType
   */
  defineAttr: function gloda_ns_defineAttr(aProvider, aAttrType,
                                           aPluginName, aAttrName, aSingular,
                                           aSubjectType, aObjectType,
                                           aParameterType,
                                           aBindName,
                                           aExplanationFormat) {
    // provider tracking
    if (!(aProvider in this._attrProviders)) {
      this._attrProviderOrder.push(aProvider);
      this._attrProviders[aProvider] = [];
    } 
    
    let compoundName = aPluginName + ":" + aAttrName;
    let attr = null;
    if (compoundName in GlodaDatastore._attributes) {
      // the existence of the GlodaAttributeDef means that either it has
      //  already been fully defined, or has been loaded from the database but
      //  not yet 'bound' to a provider (and had important meta-info that
      //  doesn't go in the db copied over)
      attr = GlodaDatastore._attributes[compoundName];
      if (attr.provider != null) {
        return attr;
      }
      
      // we are behind the abstraction veil and can set these things
      attr._provider = aProvider;
      attr._subjectType = aSubjectType;
      attr._objectType = aObjectType;
      attr._parameterType = aParameterType;
      attr._explanationFormat = aExplanationFormat;
      
      this._bindAttribute(attr, aSubjectType, aObjectType, aSingular,
                          aBindName);
      
      this._attrProviders[aProvider].push(attr);
      return attr; 
    }
    
    // Being here means the attribute def does not exist in the database.
    // Of course, we only want to create something in the database if the
    //  parameter is forever un-bound (type is null).
    let attrID = null;
    if (aParameterType == null) {
      attrID = GlodaDatastore._createAttributeDef(aAttrType, aPluginName,
                                                  aAttrName, null);
    }
    
    attr = new GlodaAttributeDef(GlodaDatastore, attrID, compoundName,
                                 aProvider, aAttrType, aPluginName, aAttrName,
                                 aSubjectType, aObjectType, aParameterType,
                                 aExplanationFormat);
    GlodaDatastore._attributes[compoundName] = attr;

    this._bindAttribute(attr, aSubjectType, aObjectType, aSingular, aBindName);

    this._attrProviders[aProvider].push(attr);
    if (aParameterType == null)    
      GlodaDatastore._attributeIDToDef[attrID] = [attr, null];
    return attr;
  },
  
  getAttrDef: function gloda_ns_getAttrDef(aPluginName, aAttrName) {
    let compoundName = aPluginName + ":" + aAttrName;
    return GlodaDatastore._attributes[compoundName];
  },
  
  processMessage: function gloda_ns_processMessage(aMessage, aMsgHdr) {
    // For now, we are ridiculously lazy and simply nuke all existing attributes
    //  before applying the new attributes.
    aMessage.clearAttributes();
    
    let allAttribs = [];
  
    for(let i = 0; i < this._attrProviderOrder.length; i++) {
      let attribs = this._attrProviderOrder[i].process(aMessage, aMsgHdr);
      allAttribs = allAttribs.concat(attribs);
    }
    
    let outAttribs = [];
    
    for(let iAttrib=0; iAttrib < allAttribs.length; iAttrib++) {
      let attribDesc = allAttribs[iAttrib];
      
      // is it an (attributedef / attribute def id, value) tuple?
      if (attribDesc.length == 2) {
        // if it's already an attrib id, we can use the tuple outright
        if (typeof attribDesc[0] == "number")
          outAttribs.push(attribDesc);
        else
          outAttribs.push([attribDesc[0].id, attribDesc[1]]);
      }
      // it must be an (attrib, parameter value, attrib value) tuple
      else {
        let attrib = attribDesc[0];
        let parameterValue = attribDesc[1];
        let attribID;
        if (parameterValue != null)
          attribID = attrib.bindParameter(parameterValue);
        else
          attribID = attrib.id;
        outAttribs.push([attribID, attribDesc[2]]);
      }
    }
    
    this._log.debug("Attributes: " + outAttribs);
    
    GlodaDatastore.insertMessageAttributes(aMessage, outAttribs);
  },
  
  queryMessagesAPV: function gloda_ns_queryMessagesAPV(aAPVs) {
    return GlodaDatastore.queryMessagesAPV(aAPVs);
  },
};

Gloda._init();

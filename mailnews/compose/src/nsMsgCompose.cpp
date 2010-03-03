/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
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
 * The Original Code is mozilla.org code.
 *
 * The Initial Developer of the Original Code is
 * Netscape Communications Corporation.
 * Portions created by the Initial Developer are Copyright (C) 1998
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Jean-Francois Ducarroz <ducarroz@netscape.com>
 *   Ben Bucksch <mozilla@bucksch.org>
 *   Håkan Waara <hwaara@chello.se>
 *   Pierre Phaneuf <pp@ludusdesign.com>
 *   Masayuki Nakano <masayuki@d-toybox.com>
 *   Olivier Parniere BT Global Services / Etat francais Ministere de la Defense
 *   Jeff Beckley <beckley@qualcomm.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either of the GNU General Public License Version 2 or later (the "GPL"),
 * or the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
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

#include "nsMsgCompose.h"
#include "nsIScriptGlobalObject.h"
#include "nsIScriptContext.h"
#include "nsIDOMNode.h"
#include "nsIDOMNodeList.h"
#include "nsIDOMHTMLImageElement.h"
#include "nsIDOMHTMLLinkElement.h"
#include "nsIDOMHTMLAnchorElement.h"
#include "nsPIDOMWindow.h"
#include "nsISelectionController.h"
#include "nsIDOMNamedNodeMap.h"
#include "nsMsgI18N.h"
#include "nsMsgCompCID.h"
#include "nsMsgQuote.h"
#include "nsIPrefService.h"
#include "nsIPrefBranch.h"
#include "nsIDocumentEncoder.h"    // for editor output flags
#include "nsIMsgHeaderParser.h"
#include "nsMsgCompUtils.h"
#include "nsComposeStrings.h"
#include "nsIMsgSend.h"
#include "nsMailHeaders.h"
#include "nsMsgPrompts.h"
#include "nsMimeTypes.h"
#include "nsICharsetConverterManager.h"
#include "nsTextFormatter.h"
#include "nsIPlaintextEditor.h"
#include "nsIHTMLEditor.h"
#include "nsIEditorMailSupport.h"
#include "nsEscape.h"
#include "plstr.h"
#include "prmem.h"
#include "nsIDocShell.h"
#include "nsIRDFService.h"
#include "nsRDFCID.h"
#include "nsAbBaseCID.h"
#include "nsIAbMDBDirectory.h"
#include "nsCExternalHandlerService.h"
#include "nsIMIMEService.h"
#include "nsIDocShellTreeItem.h"
#include "nsIDocShellTreeOwner.h"
#include "nsIWindowMediator.h"
#include "nsIURL.h"
#include "nsIMsgMailSession.h"
#include "nsMsgBaseCID.h"
#include "nsMsgMimeCID.h"
#include "nsDateTimeFormatCID.h"
#include "nsIDateTimeFormat.h"
#include "nsILocaleService.h"
#include "nsILocale.h"
#include "nsIMsgComposeService.h"
#include "nsIMsgComposeProgressParams.h"
#include "nsMsgUtils.h"
#include "nsIMsgImapMailFolder.h"
#include "nsImapCore.h"
#include "nsUnicharUtils.h"
#include "nsNetUtil.h"
#include "nsIContentViewer.h"
#include "nsIMarkupDocumentViewer.h"
#include "nsIMsgMdnGenerator.h"
#include "plbase64.h"
#include "nsIUTF8ConverterService.h"
#include "nsUConvCID.h"
#include "nsIUnicodeNormalizer.h"
#include "nsIMsgAccountManager.h"
#include "nsIMsgProgress.h"
#include "nsMsgFolderFlags.h"
#include "nsIMsgDatabase.h"
#include "nsStringStream.h"
#include "nsIMutableArray.h"
#include "nsArrayUtils.h"
#include "nsIMsgWindow.h"

static void GetReplyHeaderInfo(PRInt32* reply_header_type,
                               nsString& reply_header_locale,
                               nsString& reply_header_authorwrote,
                               nsString& reply_header_ondate,
                               nsString& reply_header_separator,
                               nsString& reply_header_colon,
                               nsString& reply_header_originalmessage)
{
  nsresult  rv;
  nsCOMPtr<nsIPrefBranch> prefBranch(do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));

  *reply_header_type = 1;
  if(NS_SUCCEEDED(rv)) {
    prefBranch->GetIntPref("mailnews.reply_header_type", reply_header_type);

    NS_GetUnicharPreferenceWithDefault(prefBranch, "mailnews.reply_header_locale", EmptyString(), reply_header_locale);
    NS_GetLocalizedUnicharPreferenceWithDefault(prefBranch, "mailnews.reply_header_authorwrote", NS_LITERAL_STRING("%s wrote"), reply_header_authorwrote);
    NS_GetLocalizedUnicharPreferenceWithDefault(prefBranch, "mailnews.reply_header_ondate", NS_LITERAL_STRING("On %s"), reply_header_ondate);
    NS_GetUnicharPreferenceWithDefault(prefBranch, "mailnews.reply_header_separator", NS_LITERAL_STRING(", "), reply_header_separator);
    NS_GetUnicharPreferenceWithDefault(prefBranch, "mailnews.reply_header_colon", NS_LITERAL_STRING(":"), reply_header_colon);
    NS_GetLocalizedUnicharPreferenceWithDefault(prefBranch, "mailnews.reply_header_originalmessage", NS_LITERAL_STRING("--- Original Message ---"), reply_header_originalmessage);
  }
}

static void TranslateLineEnding(nsString& data)
{
  PRUnichar* rPtr;   //Read pointer
  PRUnichar* wPtr;   //Write pointer
  PRUnichar* sPtr;   //Start data pointer
  PRUnichar* ePtr;   //End data pointer

  rPtr = wPtr = sPtr = data.BeginWriting();
  ePtr = rPtr + data.Length();

  while (rPtr < ePtr)
  {
    if (*rPtr == 0x0D)
      if (rPtr + 1 < ePtr && *(rPtr + 1) == 0x0A)
      {
        *wPtr = 0x0A;
        rPtr ++;
      }
      else
        *wPtr = 0x0A;
    else
      *wPtr = *rPtr;

    rPtr ++;
    wPtr ++;
  }

  data.SetLength(wPtr - sPtr);
}

static void GetTopmostMsgWindowCharacterSet(nsCString& charset, PRBool* charsetOverride)
{
  // HACK: if we are replying to a message and that message used a charset over ride
  // (as specified in the top most window (assuming the reply originated from that window)
  // then use that over ride charset instead of the charset specified in the message
  nsCOMPtr <nsIMsgMailSession> mailSession (do_GetService(NS_MSGMAILSESSION_CONTRACTID));
  if (mailSession)
  {
    nsCOMPtr<nsIMsgWindow>    msgWindow;
    mailSession->GetTopmostMsgWindow(getter_AddRefs(msgWindow));
    if (msgWindow)
    {
      msgWindow->GetMailCharacterSet(charset);
      msgWindow->GetCharsetOverride(charsetOverride);
    }
  }
}

nsMsgCompose::nsMsgCompose()
{
#if defined(DEBUG_ducarroz)
  printf("CREATE nsMsgCompose: %x\n", this);
#endif

  mQuotingToFollow = PR_FALSE;
  mInsertingQuotedContent = PR_FALSE;
  mWhatHolder = 1;
  m_window = nsnull;
  m_editor = nsnull;
  mQuoteStreamListener=nsnull;
  mCharsetOverride = PR_FALSE;
  mDeleteDraft = PR_FALSE;
  m_compFields = nsnull;    //m_compFields will be set during nsMsgCompose::Initialize
  mType = nsIMsgCompType::New;

  // For TagConvertible
  // Read and cache pref
  mConvertStructs = PR_FALSE;
  nsCOMPtr<nsIPrefBranch> prefBranch (do_GetService(NS_PREFSERVICE_CONTRACTID));
  if (prefBranch)
    prefBranch->GetBoolPref("converter.html2txt.structs", &mConvertStructs);

  m_composeHTML = PR_FALSE;
  mRecycledWindow = PR_TRUE;
}


nsMsgCompose::~nsMsgCompose()
{
#if defined(DEBUG_ducarroz)
  printf("DISPOSE nsMsgCompose: %x\n", this);
#endif

  NS_IF_RELEASE(m_compFields);
  NS_IF_RELEASE(mQuoteStreamListener);
}

/* the following macro actually implement addref, release and query interface for our component. */
NS_IMPL_THREADSAFE_ADDREF(nsMsgCompose)
NS_IMPL_THREADSAFE_RELEASE(nsMsgCompose)

NS_INTERFACE_MAP_BEGIN(nsMsgCompose)
  NS_INTERFACE_MAP_ENTRY_AMBIGUOUS(nsISupports, nsIMsgCompose)
  NS_INTERFACE_MAP_ENTRY(nsIMsgCompose)
  NS_INTERFACE_MAP_ENTRY(nsIMsgSendListener)
  NS_INTERFACE_MAP_ENTRY(nsISupportsWeakReference)
NS_INTERFACE_MAP_END

//
// Once we are here, convert the data which we know to be UTF-8 to UTF-16
// for insertion into the editor
//
nsresult
GetChildOffset(nsIDOMNode *aChild, nsIDOMNode *aParent, PRInt32 &aOffset)
{
  NS_ASSERTION((aChild && aParent), "bad args");
  nsresult result = NS_ERROR_NULL_POINTER;
  if (aChild && aParent)
  {
    nsCOMPtr<nsIDOMNodeList> childNodes;
    result = aParent->GetChildNodes(getter_AddRefs(childNodes));
    if ((NS_SUCCEEDED(result)) && (childNodes))
    {
      PRInt32 i=0;
      for ( ; NS_SUCCEEDED(result); i++)
      {
        nsCOMPtr<nsIDOMNode> childNode;
        result = childNodes->Item(i, getter_AddRefs(childNode));
        if ((NS_SUCCEEDED(result)) && (childNode))
        {
          if (childNode.get()==aChild)
          {
            aOffset = i;
            break;
          }
        }
        else if (!childNode)
          result = NS_ERROR_NULL_POINTER;
      }
    }
    else if (!childNodes)
      result = NS_ERROR_NULL_POINTER;
  }
  return result;
}

nsresult
GetNodeLocation(nsIDOMNode *inChild, nsCOMPtr<nsIDOMNode> *outParent, PRInt32 *outOffset)
{
  NS_ASSERTION((outParent && outOffset), "bad args");
  nsresult result = NS_ERROR_NULL_POINTER;
  if (inChild && outParent && outOffset)
  {
    result = inChild->GetParentNode(getter_AddRefs(*outParent));
    if ( (NS_SUCCEEDED(result)) && (*outParent) )
    {
      result = GetChildOffset(inChild, *outParent, *outOffset);
    }
  }

  return result;
}

PRBool nsMsgCompose::IsEmbeddedObjectSafe(const char * originalScheme,
                                          const char * originalHost,
                                          const char * originalPath,
                                          nsIDOMNode * object)
{
  nsresult rv;

  nsCOMPtr<nsIDOMHTMLImageElement> image;
  nsCOMPtr<nsIDOMHTMLLinkElement> link;
  nsCOMPtr<nsIDOMHTMLAnchorElement> anchor;
  nsAutoString objURL;

  if (!object || !originalScheme || !originalPath) //having a null host is ok...
    return PR_FALSE;

  if ((image = do_QueryInterface(object)))
  {
    if (NS_FAILED(image->GetSrc(objURL)))
      return PR_FALSE;
  }
  else if ((link = do_QueryInterface(object)))
  {
    if (NS_FAILED(link->GetHref(objURL)))
      return PR_FALSE;
  }
  else if ((anchor = do_QueryInterface(object)))
  {
    if (NS_FAILED(anchor->GetHref(objURL)))
      return PR_FALSE;
  }
  else
    return PR_FALSE;

  if (!objURL.IsEmpty())
  {
    nsCOMPtr<nsIURI> uri;
    rv = NS_NewURI(getter_AddRefs(uri), objURL);
    if (NS_SUCCEEDED(rv) && uri)
    {
      nsCAutoString scheme;
      rv = uri->GetScheme(scheme);
      if (NS_SUCCEEDED(rv) && scheme.Equals(originalScheme, nsCaseInsensitiveCStringComparator()))
      {
        nsCAutoString host;
        rv = uri->GetAsciiHost(host);
        // mailbox url don't have a host therefore don't be too strict.
        if (NS_SUCCEEDED(rv) && (host.IsEmpty() || originalHost || host.Equals(originalHost, nsCaseInsensitiveCStringComparator())))
        {
          nsCAutoString path;
          rv = uri->GetPath(path);
          if (NS_SUCCEEDED(rv))
          {
            const char * query = strrchr(path.get(), '?');
            if (query && PL_strncasecmp(path.get(), originalPath, query - path.get()) == 0)
                return PR_TRUE; //This object is a part of the original message, we can send it safely.
          }
        }
      }
    }
  }

  return PR_FALSE;
}

/* Reset the uri's of embedded objects because we've saved the draft message, and the
   original message doesn't exist anymore.
 */
nsresult nsMsgCompose::ResetUrisForEmbeddedObjects()
{
  nsCOMPtr<nsISupportsArray> aNodeList;
  PRUint32 numNodes;
  PRUint32 i;

  nsCOMPtr<nsIEditorMailSupport> mailEditor (do_QueryInterface(m_editor));
  if (!mailEditor)
    return NS_ERROR_FAILURE;

  nsresult rv = mailEditor->GetEmbeddedObjects(getter_AddRefs(aNodeList));
  if ((NS_FAILED(rv) || (!aNodeList)))
    return NS_ERROR_FAILURE;

  if (NS_FAILED(aNodeList->Count(&numNodes)))
    return NS_ERROR_FAILURE;

  nsCOMPtr<nsIDOMNode> node;
  nsCString curDraftIdURL;

  rv = m_compFields->GetDraftId(getter_Copies(curDraftIdURL));
  NS_ASSERTION((NS_SUCCEEDED(rv) && (!curDraftIdURL.IsEmpty())), "RemoveCurrentDraftMessage can't get draft id");

  // Skip if no draft id (probably a new draft msg).
  if (NS_SUCCEEDED(rv) && mMsgSend && !curDraftIdURL.IsEmpty())
  {
    // we don't currently handle imap urls
    if (StringBeginsWith(curDraftIdURL, NS_LITERAL_CSTRING("imap-message")))
      return NS_OK;

    nsCOMPtr <nsIMsgDBHdr> msgDBHdr;
    rv = GetMsgDBHdrFromURI(curDraftIdURL.get(), getter_AddRefs(msgDBHdr));
    NS_ASSERTION(NS_SUCCEEDED(rv), "RemoveCurrentDraftMessage can't get msg header DB interface pointer.");
    if (NS_SUCCEEDED(rv) && msgDBHdr)
    {
      nsMsgKey oldDraftKey;

      // build up the old and new ?number= parts. This code assumes it is
      // called *before* RemoveCurrentDraftMessage, so that curDraftIdURL
      // is the previous draft.
      // This code currently only works for local mail folders.
      // For imap folders, the url looks like <folder>%3E<UID>?part=...
      // We could handle the imap case as well, but it turns out
      // not to be so important because the old message is still on
      // the imap server. If it turns out to be a problem, we can
      // deal with imap urls as well.
      msgDBHdr->GetMessageKey(&oldDraftKey);
      nsAutoString oldNumberPart(NS_LITERAL_STRING("?number="));
      oldNumberPart.AppendInt(oldDraftKey);
      nsAutoString newNumberPart;
      nsMsgKey newMsgKey;
      mMsgSend->GetMessageKey(&newMsgKey);
      newNumberPart.AppendInt(newMsgKey);

      nsCOMPtr<nsIDOMElement> domElement;
      for (i = 0; i < numNodes; i ++)
      {
        domElement = do_QueryElementAt(aNodeList, i);
        if (!domElement)
          continue;

        nsCOMPtr<nsIDOMHTMLImageElement> image = do_QueryInterface(domElement);
        if (!image)
          continue;
        // do we care about anything besides images?
        nsAutoString objURL;
        image->GetSrc(objURL);
        // the objURL is the full path to the mailbox,
        // e.g., mailbox:///C/Documents%20Settings.../Local%20Folders/Drafts?number=
        // Find the ?number= part of the uri, and replace the
        // old number with the new msg key.

        PRInt32 numberIndex = objURL.Find(oldNumberPart);
        if (numberIndex != kNotFound)
        {
          objURL.Replace(numberIndex + 8, oldNumberPart.Length() - 8, newNumberPart);
          image->SetSrc(objURL);
        }
      }
    }
  }

  return NS_OK;
}


/* The purpose of this function is to mark any embedded object that wasn't a RFC822 part
   of the original message as moz-do-not-send.
   That will prevent us to attach data not specified by the user or not present in the
   original message.
*/
nsresult nsMsgCompose::TagEmbeddedObjects(nsIEditorMailSupport *aEditor)
{
  nsresult rv = NS_OK;
  nsCOMPtr<nsISupportsArray> aNodeList;
  PRUint32 count;
  PRUint32 i;

  if (!aEditor)
    return NS_ERROR_FAILURE;

  rv = aEditor->GetEmbeddedObjects(getter_AddRefs(aNodeList));
  if ((NS_FAILED(rv) || (!aNodeList)))
    return NS_ERROR_FAILURE;

  if (NS_FAILED(aNodeList->Count(&count)))
    return NS_ERROR_FAILURE;

  nsCOMPtr<nsIDOMNode> node;

  nsCOMPtr<nsIURI> originalUrl;
  nsCString originalScheme;
  nsCString originalHost;
  nsCString originalPath;

  // first, convert the rdf original msg uri into a url that represents the message...
  nsCOMPtr <nsIMsgMessageService> msgService;
  rv = GetMessageServiceFromURI(mOriginalMsgURI, getter_AddRefs(msgService));
  if (NS_SUCCEEDED(rv))
  {
    rv = msgService->GetUrlForUri(mOriginalMsgURI.get(), getter_AddRefs(originalUrl), nsnull);
    if (NS_SUCCEEDED(rv) && originalUrl)
    {
      originalUrl->GetScheme(originalScheme);
      originalUrl->GetAsciiHost(originalHost);
      originalUrl->GetPath(originalPath);
    }
  }

  // Then compare the url of each embedded objects with the original message.
  // If they a not coming from the original message, they should not be sent
  // with the message.
  nsCOMPtr<nsIDOMElement> domElement;
  for (i = 0; i < count; i ++)
  {
    node = do_QueryElementAt(aNodeList, i);
    if (!node)
      continue;
    if (IsEmbeddedObjectSafe(originalScheme.get(), originalHost.get(),
                             originalPath.get(), node))
      continue; //Don't need to tag this object, it safe to send it.

    //The source of this object should not be sent with the message
    domElement = do_QueryInterface(node);
    if (domElement)
      domElement->SetAttribute(NS_LITERAL_STRING("moz-do-not-send"), NS_LITERAL_STRING("true"));
  }

  return NS_OK;
}

NS_IMETHODIMP
nsMsgCompose::GetInsertingQuotedContent(PRBool * aInsertingQuotedText)
{
  NS_ENSURE_ARG_POINTER(aInsertingQuotedText);
  *aInsertingQuotedText = mInsertingQuotedContent;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgCompose::SetInsertingQuotedContent(PRBool aInsertingQuotedText)
{
  mInsertingQuotedContent = aInsertingQuotedText;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgCompose::ConvertAndLoadComposeWindow(nsString& aPrefix,
                                          nsString& aBuf,
                                          nsString& aSignature,
                                          PRBool aQuoted,
                                          PRBool aHTMLEditor)
{
  NS_ASSERTION(m_editor, "ConvertAndLoadComposeWindow but no editor\n");
  if (!m_editor)
    return NS_ERROR_FAILURE;

  // First, get the nsIEditor interface for future use
  nsCOMPtr<nsIDOMNode> nodeInserted;

  TranslateLineEnding(aPrefix);
  TranslateLineEnding(aBuf);
  TranslateLineEnding(aSignature);

  // We're going to be inserting stuff, and MsgComposeCommands
  // may have set the editor to readonly in the recycled case.
  // So set it back to writable.
  // Note!  enableEditableFields in gComposeRecyclingListener::onReopen
  // will redundantly set this flag to writable, but it gets there
  // too late.
  PRUint32 flags = 0;
  m_editor->GetFlags(&flags);
  flags &= ~nsIPlaintextEditor::eEditorReadonlyMask;
  m_editor->SetFlags(flags);

  m_editor->EnableUndo(PR_FALSE);

  // Ok - now we need to figure out the charset of the aBuf we are going to send
  // into the editor shell. There are I18N calls to sniff the data and then we need
  // to call the new routine in the editor that will allow us to send in the charset
  //

  // Now, insert it into the editor...
  nsCOMPtr<nsIHTMLEditor> htmlEditor (do_QueryInterface(m_editor));
  nsCOMPtr<nsIPlaintextEditor> textEditor (do_QueryInterface(m_editor));
  nsCOMPtr<nsIEditorMailSupport> mailEditor (do_QueryInterface(m_editor));
  m_editor->BeginTransaction();
  PRInt32 reply_on_top = 0;
  PRBool sig_bottom = PR_TRUE;
  m_identity->GetReplyOnTop(&reply_on_top);
  m_identity->GetSigBottom(&sig_bottom);

  PRBool sigOnTop = (reply_on_top == 1 && !sig_bottom);
  if (aQuoted)
  {
    mInsertingQuotedContent = PR_TRUE;
    if (!aPrefix.IsEmpty())
    {
      if (!aHTMLEditor)
        aPrefix.AppendLiteral("\n");
      textEditor->InsertText(aPrefix);
      m_editor->EndOfDocument();
    }

    if (!aBuf.IsEmpty() && mailEditor)
    {
      if (aHTMLEditor && !mCiteReference.IsEmpty())
        mailEditor->InsertAsCitedQuotation(aBuf,
                                           mCiteReference,
                                           PR_TRUE,
                                           getter_AddRefs(nodeInserted));
      else
        mailEditor->InsertAsQuotation(aBuf,
                                      getter_AddRefs(nodeInserted));

      m_editor->EndOfDocument();
    }

    mInsertingQuotedContent = PR_FALSE;

    (void)TagEmbeddedObjects(mailEditor);

    if (!aSignature.IsEmpty())
    {
      //we cannot add it on top earlier, because TagEmbeddedObjects will mark all images in the signature as "moz-do-not-send"
      if( sigOnTop )
        m_editor->BeginningOfDocument();

      if (aHTMLEditor && htmlEditor)
        htmlEditor->InsertHTML(aSignature);
      else if (textEditor)
        textEditor->InsertText(aSignature);

      if( sigOnTop )
        m_editor->EndOfDocument();
    }
  }
  else
  {
    if (aHTMLEditor && htmlEditor)
    {
      mInsertingQuotedContent = PR_TRUE;
      htmlEditor->RebuildDocumentFromSource(aBuf);
      mInsertingQuotedContent = PR_FALSE;

      // when forwarding a message as inline, tag any embedded objects
      // which refer to local images or files so we know not to include
      // send them
      if (mType == nsIMsgCompType::ForwardInline)
        (void)TagEmbeddedObjects(mailEditor);

      if (!aSignature.IsEmpty())
      {
        if (sigOnTop)
          m_editor->BeginningOfDocument();
        else
          m_editor->EndOfDocument();
        htmlEditor->InsertHTML(aSignature);
        if (sigOnTop)
          m_editor->EndOfDocument();
      }
      else
        m_editor->EndOfDocument();
    }
    else if (textEditor)
    {
      if (sigOnTop && !aSignature.IsEmpty())
      {
        textEditor->InsertText(aSignature);
        m_editor->EndOfDocument();
      }

      if (!aBuf.IsEmpty())
      {
        if (mailEditor)
          mailEditor->InsertTextWithQuotations(aBuf);
        else
          textEditor->InsertText(aBuf);
        m_editor->EndOfDocument();
      }

      if (!sigOnTop && !aSignature.IsEmpty())
        textEditor->InsertText(aSignature);
    }
  }
  m_editor->EndTransaction();

  if (m_editor)
  {
    if (aBuf.IsEmpty())
      m_editor->BeginningOfDocument();
    else
    {
      switch (reply_on_top)
        {
          // This should set the cursor after the body but before the sig
          case 0  :
          {
            if (!textEditor)
            {
              m_editor->BeginningOfDocument();
              break;
            }

            nsCOMPtr<nsISelection> selection = nsnull;
            nsCOMPtr<nsIDOMNode>      parent = nsnull;
            PRInt32                   offset;
            nsresult                  rv;

            // get parent and offset of mailcite
            rv = GetNodeLocation(nodeInserted, address_of(parent), &offset);
            if (NS_FAILED(rv) || (!parent))
            {
              m_editor->BeginningOfDocument();
              break;
            }

            // get selection
            m_editor->GetSelection(getter_AddRefs(selection));
            if (!selection)
            {
              m_editor->BeginningOfDocument();
              break;
            }

            // place selection after mailcite
            selection->Collapse(parent, offset+1);

            // insert a break at current selection
            textEditor->InsertLineBreak();

            // i'm not sure if you need to move the selection back to before the
            // break. expirement.
            selection->Collapse(parent, offset+1);

            break;
          }

        case 2  :
        {
          m_editor->SelectAll();
          break;
        }

        // This should set the cursor to the top!
        default : m_editor->BeginningOfDocument();    break;
      }
    }

    nsCOMPtr<nsISelectionController> selCon;
    m_editor->GetSelectionController(getter_AddRefs(selCon));

    if (selCon)
      selCon->ScrollSelectionIntoView(nsISelectionController::SELECTION_NORMAL, nsISelectionController::SELECTION_ANCHOR_REGION, PR_TRUE);
  }

  if (m_editor)
    m_editor->EnableUndo(PR_TRUE);
  SetBodyModified(PR_FALSE);

#ifdef MSGCOMP_TRACE_PERFORMANCE
  nsCOMPtr<nsIMsgComposeService> composeService (do_GetService(NS_MSGCOMPOSESERVICE_CONTRACTID));
  composeService->TimeStamp("Finished inserting data into the editor. The window is finally ready!", PR_FALSE);
#endif
  return NS_OK;
}

/**
 * Check the identity pref to include signature on replies and forwards.
 */
PRBool nsMsgCompose::CheckIncludeSignaturePrefs(nsIMsgIdentity *identity)
{
  PRBool includeSignature = PR_TRUE;
  switch (mType)
  {
    case nsIMsgCompType::ForwardInline:
    case nsIMsgCompType::ForwardAsAttachment:
      identity->GetSigOnForward(&includeSignature);
      break;
    case nsIMsgCompType::Reply:
    case nsIMsgCompType::ReplyAll:
    case nsIMsgCompType::ReplyToList:
    case nsIMsgCompType::ReplyToGroup:
    case nsIMsgCompType::ReplyToSender:
    case nsIMsgCompType::ReplyToSenderAndGroup:
      identity->GetSigOnReply(&includeSignature);
      break;
  }
  return includeSignature;
}

nsresult
nsMsgCompose::SetQuotingToFollow(PRBool aVal)
{
  mQuotingToFollow = aVal;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgCompose::GetQuotingToFollow(PRBool* quotingToFollow)
{
  NS_ENSURE_ARG(quotingToFollow);
  *quotingToFollow = mQuotingToFollow;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgCompose::Initialize(nsIDOMWindowInternal *aWindow, nsIMsgComposeParams *params)
{
  NS_ENSURE_ARG_POINTER(params);
  nsresult rv;

  params->GetIdentity(getter_AddRefs(m_identity));

  if (aWindow)
  {
    m_window = aWindow;
    nsCOMPtr<nsPIDOMWindow> window(do_QueryInterface(aWindow));
    if (!window)
      return NS_ERROR_FAILURE;

    nsCOMPtr<nsIDocShellTreeItem>  treeItem =
      do_QueryInterface(window->GetDocShell());
    nsCOMPtr<nsIDocShellTreeOwner> treeOwner;
    rv = treeItem->GetTreeOwner(getter_AddRefs(treeOwner));
    if (NS_FAILED(rv)) return rv;

    m_baseWindow = do_QueryInterface(treeOwner);

    window->GetDocShell()->SetAppType(nsIDocShell::APP_TYPE_EDITOR);
  }

  MSG_ComposeFormat format;
  params->GetFormat(&format);

  MSG_ComposeType type;
  params->GetType(&type);

  nsCString originalMsgURI;
  params->GetOriginalMsgURI(getter_Copies(originalMsgURI));
  params->GetOrigMsgHdr(getter_AddRefs(mOrigMsgHdr));

  nsCOMPtr<nsIMsgCompFields> composeFields;
  params->GetComposeFields(getter_AddRefs(composeFields));

  nsCOMPtr<nsIMsgComposeService> composeService = do_GetService(NS_MSGCOMPOSESERVICE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv,rv);

  rv = composeService->DetermineComposeHTML(m_identity, format, &m_composeHTML);
  NS_ENSURE_SUCCESS(rv,rv);

  if (composeFields)
  {
    nsCAutoString draftId; // will get set for drafts and templates
    rv = composeFields->GetDraftId(getter_Copies(draftId));
    NS_ENSURE_SUCCESS(rv,rv);

    // Set return receipt flag and type, and if we should attach a vCard
    // by checking the identity prefs - but don't clobber the values for
    // drafts and templates as they were set up already by mime when
    // initializing the message.
    if (m_identity && draftId.IsEmpty())
    {
      PRBool requestReturnReceipt = PR_FALSE;
      rv = m_identity->GetRequestReturnReceipt(&requestReturnReceipt);
      NS_ENSURE_SUCCESS(rv, rv);
      rv = composeFields->SetReturnReceipt(requestReturnReceipt);
      NS_ENSURE_SUCCESS(rv, rv);

      PRInt32 receiptType = nsIMsgMdnGenerator::eDntType;
      rv = m_identity->GetReceiptHeaderType(&receiptType);
      NS_ENSURE_SUCCESS(rv, rv);
      rv = composeFields->SetReceiptHeaderType(receiptType);
      NS_ENSURE_SUCCESS(rv, rv);

      PRBool requestDSN = PR_FALSE;
      rv = m_identity->GetRequestDSN(&requestDSN);
      NS_ENSURE_SUCCESS(rv, rv);
      rv = composeFields->SetDSN(requestDSN);
      NS_ENSURE_SUCCESS(rv, rv);

      PRBool attachVCard;
      rv = m_identity->GetAttachVCard(&attachVCard);
      NS_ENSURE_SUCCESS(rv, rv);
      rv = composeFields->SetAttachVCard(attachVCard);
      NS_ENSURE_SUCCESS(rv, rv);
    }
  }

  nsCOMPtr<nsIMsgSendListener> externalSendListener;
  params->GetSendListener(getter_AddRefs(externalSendListener));
  if(externalSendListener)
    AddMsgSendListener( externalSendListener );

  nsCString smtpPassword;
  params->GetSmtpPassword(getter_Copies(smtpPassword));
  mSmtpPassword = smtpPassword;

  params->GetHtmlToQuote(mHtmlToQuote);

  if (aWindow)
  {
    // register the compose object with the compose service
    rv = composeService->RegisterComposeWindow(aWindow, this);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  return CreateMessage(originalMsgURI.get(), type, composeFields);
}

nsresult nsMsgCompose::SetDocumentCharset(const char *charset)
{
  // Set charset, this will be used for the MIME charset labeling.
  m_compFields->SetCharacterSet(charset);

  // notify the change to editor
  m_editor->SetDocumentCharacterSet(charset ? nsDependentCString(charset): EmptyCString());

  return NS_OK;
}

NS_IMETHODIMP
nsMsgCompose::RegisterStateListener(nsIMsgComposeStateListener *aStateListener)
{
  NS_ENSURE_ARG_POINTER(aStateListener);

  return mStateListeners.AppendElement(aStateListener) ? NS_OK : NS_ERROR_FAILURE;
}

NS_IMETHODIMP
nsMsgCompose::UnregisterStateListener(nsIMsgComposeStateListener *aStateListener)
{
  NS_ENSURE_ARG_POINTER(aStateListener);

  PRInt32 index = mStateListeners.IndexOf(aStateListener);
  if (index == -1)
    return NS_ERROR_FAILURE;

  return mStateListeners.RemoveElement(aStateListener) ? NS_OK : NS_ERROR_FAILURE;
}

// Added to allow easier use of the nsIMsgSendListener
NS_IMETHODIMP nsMsgCompose::AddMsgSendListener( nsIMsgSendListener *aMsgSendListener )
{
  NS_ENSURE_ARG_POINTER(aMsgSendListener);
  return mExternalSendListeners.AppendElement(aMsgSendListener) ? NS_OK : NS_ERROR_FAILURE;
}

NS_IMETHODIMP nsMsgCompose::RemoveMsgSendListener( nsIMsgSendListener *aMsgSendListener )
{
  NS_ENSURE_ARG_POINTER(aMsgSendListener);
  return mExternalSendListeners.RemoveElement(aMsgSendListener) ? NS_OK : NS_ERROR_FAILURE;
}

nsresult nsMsgCompose::_SendMsg(MSG_DeliverMode deliverMode, nsIMsgIdentity *identity, 
                                const char *accountKey, PRBool entityConversionDone)
{
  nsresult rv = NS_OK;

  printf("deliver mode: %d\n", deliverMode);

  // clear saved message id if sending, so we don't send out the same message-id.
  if (deliverMode == nsIMsgCompDeliverMode::Now ||
      deliverMode == nsIMsgCompDeliverMode::Later ||
      deliverMode == nsIMsgCompDeliverMode::Background)
    m_compFields->SetMessageId("");

  if (m_compFields && identity)
  {
    // Pref values are supposed to be stored as UTF-8, so no conversion
    nsCString email;
    nsString fullName;
    nsString organization;

    identity->GetEmail(email);
    identity->GetFullName(fullName);
    identity->GetOrganization(organization);

    nsCString sender;
    nsCOMPtr<nsIMsgHeaderParser> parser (do_GetService(NS_MAILNEWS_MIME_HEADER_PARSER_CONTRACTID));
    if (parser) {
      // convert to UTF8 before passing to MakeFullAddressString
      parser->MakeFullAddressString(NS_ConvertUTF16toUTF8(fullName).get(),
                                    email.get(), getter_Copies(sender));
    }

    m_compFields->SetFrom(sender.IsEmpty() ? email.get() : sender.get());
    m_compFields->SetOrganization(organization);
    mMsgSend = do_CreateInstance(NS_MSGSEND_CONTRACTID);
    if (mMsgSend)
    {
      PRBool      newBody = PR_FALSE;
      char        *bodyString = (char *)m_compFields->GetBody();
      PRInt32     bodyLength;
      const char  attachment1_type[] = TEXT_HTML;  // we better be "text/html" at this point

      if (!entityConversionDone)
      {
        // Convert body to mail charset
        char      *outCString;

        if (  bodyString && *bodyString )
        {
          // Apply entity conversion then convert to a mail charset.
          PRBool isAsciiOnly;
          rv = nsMsgI18NSaveAsCharset(attachment1_type, m_compFields->GetCharacterSet(),
                                      NS_ConvertUTF8toUTF16(bodyString).get(), &outCString,
                                      nsnull, &isAsciiOnly);
          if (NS_SUCCEEDED(rv))
          {
            if (m_compFields->GetForceMsgEncoding())
              isAsciiOnly = PR_FALSE;

            m_compFields->SetBodyIsAsciiOnly(isAsciiOnly);
            bodyString = outCString;
            newBody = PR_TRUE;
          }
        }
      }

      bodyLength = PL_strlen(bodyString);

      // Create the listener for the send operation...
      nsCOMPtr<nsIMsgComposeSendListener> composeSendListener = do_CreateInstance(NS_MSGCOMPOSESENDLISTENER_CONTRACTID);
      if (!composeSendListener)
        return NS_ERROR_OUT_OF_MEMORY;

      // right now, AutoSaveAsDraft is identical to SaveAsDraft as
      // far as the msg send code is concerned. This way, we don't have
      // to add an nsMsgDeliverMode for autosaveasdraft, and add cases for
      // it in the msg send code.
      if (deliverMode == nsIMsgCompDeliverMode::AutoSaveAsDraft)
        deliverMode = nsIMsgCompDeliverMode::SaveAsDraft;

      nsRefPtr<nsIMsgCompose> msgCompose(this);
      composeSendListener->SetMsgCompose(msgCompose);
      composeSendListener->SetDeliverMode(deliverMode);

      if (mProgress)
      {
        nsCOMPtr<nsIWebProgressListener> progressListener = do_QueryInterface(composeSendListener);
        mProgress->RegisterListener(progressListener);
      }

      // If we are composing HTML, then this should be sent as
      // multipart/related which means we pass the editor into the
      // backend...if not, just pass nsnull
      //
      nsCOMPtr<nsIMsgSendListener> sendListener = do_QueryInterface(composeSendListener);
      rv = mMsgSend->CreateAndSendMessage(
                    m_composeHTML ? m_editor.get() : nsnull,
                    identity,
                    accountKey,
                    m_compFields,
                    PR_FALSE,                           // PRBool                            digest_p,
                    PR_FALSE,                           // PRBool                            dont_deliver_p,
                    (nsMsgDeliverMode)deliverMode,      // nsMsgDeliverMode                  mode,
                    nsnull,                             // nsIMsgDBHdr                       *msgToReplace,
                    m_composeHTML?TEXT_HTML:TEXT_PLAIN, // const char                        *attachment1_type,
                    bodyString,                         // const char                        *attachment1_body,
                    bodyLength,                         // PRUint32                          attachment1_body_length,
                    nsnull,                             // const struct nsMsgAttachmentData  *attachments,
                    nsnull,                             // const struct nsMsgAttachedFile    *preloaded_attachments,
                    nsnull,                             // nsMsgSendPart                     *relatedPart,
                    m_window,                           // nsIDOMWindowInternal              *parentWindow;
                    mProgress,                          // nsIMsgProgress                    *progress,
                    sendListener,                       // listener
                    mSmtpPassword.get(),
                    mOriginalMsgURI,
                    mType);

      // Cleanup converted body...
      if (newBody)
        PR_FREEIF(bodyString);
    }
    else
        rv = NS_ERROR_FAILURE;
  }
  else
    rv = NS_ERROR_NOT_INITIALIZED;

  if (NS_FAILED(rv))
    NotifyStateListeners(nsIMsgComposeNotificationType::ComposeProcessDone, rv);

  return rv;
}

NS_IMETHODIMP nsMsgCompose::SendMsg(MSG_DeliverMode deliverMode, nsIMsgIdentity *identity, const char *accountKey, nsIMsgWindow *aMsgWindow, nsIMsgProgress *progress)
{
  nsresult rv = NS_OK;
  PRBool entityConversionDone = PR_FALSE;
  nsCOMPtr<nsIPrompt> prompt;

  // i'm assuming the compose window is still up at this point...
  if (!prompt && m_window)
     m_window->GetPrompter(getter_AddRefs(prompt));

  if (m_compFields && !m_composeHTML)
  {
    // The plain text compose window was used
    const char contentType[] = "text/plain";
    nsString msgBody;
    PRUint32 flags = nsIDocumentEncoder::OutputFormatted | nsIDocumentEncoder::OutputCRLineBreak |
      nsIDocumentEncoder::OutputLFLineBreak;
    if (m_editor)
    {
      // Reset message body previously stored in the compose fields
      // There is 2 nsIMsgCompFields::SetBody() functions using a pointer as argument,
      // therefore a casting is required.
      m_compFields->SetBody((const char *)nsnull);

      const char *charset = m_compFields->GetCharacterSet();
      if(UseFormatFlowed(charset))
          flags |= nsIDocumentEncoder::OutputFormatFlowed;

      rv = m_editor->OutputToString(NS_LITERAL_STRING("text/plain"), flags, msgBody);
    }
    else
    {
      m_compFields->GetBody(msgBody);
    }
    if (NS_SUCCEEDED(rv) && !msgBody.IsEmpty())
    {
      // Convert body to mail charset
      nsCString outCString;
      nsCString fallbackCharset;
      PRBool isAsciiOnly;
      // check if the body text is covered by the current charset.
      rv = nsMsgI18NSaveAsCharset(contentType, m_compFields->GetCharacterSet(),
                                  msgBody.get(), getter_Copies(outCString),
                                  getter_Copies(fallbackCharset), &isAsciiOnly);
      if (m_compFields->GetForceMsgEncoding())
        isAsciiOnly = PR_FALSE;
      if (NS_SUCCEEDED(rv) && !outCString.IsEmpty())
      {
        // If the body contains characters outside the repertoire of the current
        // charset, just convert to UTF-8 and be done with it
        // unless disable_fallback_to_utf8 is set for this charset.
        if (NS_ERROR_UENC_NOMAPPING == rv && m_editor)
        {
          PRBool needToCheckCharset;
          m_compFields->GetNeedToCheckCharset(&needToCheckCharset);
          if (needToCheckCharset)
          {
            PRBool disableFallback = PR_FALSE;
            nsCOMPtr<nsIPrefBranch> prefBranch (do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
            if (prefBranch)
            {
              nsCString prefName("mailnews.disable_fallback_to_utf8.");
              prefName.Append(m_compFields->GetCharacterSet());
              prefBranch->GetBoolPref(prefName.get(), &disableFallback);
            }
            if (!disableFallback)
            {
              CopyUTF16toUTF8(msgBody.get(), outCString);
              m_compFields->SetCharacterSet("UTF-8");
            }
          }
        }
        else if (!fallbackCharset.IsEmpty())
        {
          // re-label to the fallback charset
          m_compFields->SetCharacterSet(fallbackCharset.get());
        }
        m_compFields->SetBodyIsAsciiOnly(isAsciiOnly);
        m_compFields->SetBody(outCString.get());
        entityConversionDone = PR_TRUE;
      }
      else
        m_compFields->SetBody(NS_LossyConvertUTF16toASCII(msgBody).get());
    }
  }

  // Let's open the progress dialog
  if (progress)
  {
    mProgress = progress;

    if (deliverMode != nsIMsgCompDeliverMode::AutoSaveAsDraft)
    {
      nsAutoString msgSubject;
      m_compFields->GetSubject(msgSubject);

      PRBool showProgress = PR_FALSE;
      nsCOMPtr<nsIPrefBranch> prefBranch (do_GetService(NS_PREFSERVICE_CONTRACTID));
      if (prefBranch)
      {
        prefBranch->GetBoolPref("mailnews.show_send_progress", &showProgress);
        if (showProgress)
        {
          nsCOMPtr<nsIMsgComposeProgressParams> params = do_CreateInstance(NS_MSGCOMPOSEPROGRESSPARAMS_CONTRACTID, &rv);
          if (NS_FAILED(rv) || !params)
            return NS_ERROR_FAILURE;

          params->SetSubject(msgSubject.get());
          params->SetDeliveryMode(deliverMode);

          mProgress->OpenProgressDialog(m_window, aMsgWindow, 
                                        "chrome://messenger/content/messengercompose/sendProgress.xul", 
                                        PR_FALSE, params);
        }
      }
    }

    mProgress->OnStateChange(nsnull, nsnull, nsIWebProgressListener::STATE_START, NS_OK);
  }

  PRBool attachVCard = PR_FALSE;
  if (m_compFields)
      m_compFields->GetAttachVCard(&attachVCard);

  if (attachVCard && identity &&
      (deliverMode == nsIMsgCompDeliverMode::Now ||
       deliverMode == nsIMsgCompDeliverMode::Later ||
       deliverMode == nsIMsgCompDeliverMode::Background))
  {
      nsCString escapedVCard;
      // make sure, if there is no card, this returns an empty string, or NS_ERROR_FAILURE
      rv = identity->GetEscapedVCard(escapedVCard);

      if (NS_SUCCEEDED(rv) && !escapedVCard.IsEmpty())
      {
          nsCString vCardUrl;
          vCardUrl = "data:text/x-vcard;charset=utf-8;base64,";
          char *unescapedData = ToNewCString(escapedVCard);
          if (!unescapedData)
              return NS_ERROR_OUT_OF_MEMORY;
          nsUnescape(unescapedData);
          char *result = PL_Base64Encode(unescapedData, 0, nsnull);
          vCardUrl += result;
          PR_Free(result);
          PR_Free(unescapedData);

          nsCOMPtr<nsIMsgAttachment> attachment = do_CreateInstance(NS_MSGATTACHMENT_CONTRACTID, &rv);
          if (NS_SUCCEEDED(rv) && attachment)
          {
              // [comment from 4.x]
              // Send the vCard out with a filename which distinguishes this user. e.g. jsmith.vcf
              // The main reason to do this is for interop with Eudora, which saves off
              // the attachments separately from the message body
              nsCString userid;
              (void)identity->GetEmail(userid);
              PRInt32 index = userid.FindChar('@');
              if (index != kNotFound)
                  userid.Truncate(index);

              if (userid.IsEmpty())
                  attachment->SetName(NS_LITERAL_STRING("vcard.vcf"));
              else
              {
                  // Replace any dot with underscore to stop vCards
                  // generating false positives with some heuristic scanners
                  userid.ReplaceChar('.', '_');
                  userid.AppendLiteral(".vcf");
                  attachment->SetName(NS_ConvertASCIItoUTF16(userid));
              }

              attachment->SetUrl(vCardUrl.get());
              m_compFields->AddAttachment(attachment);
          }
      }
  }

  // Save the identity being sent for later use.
  m_identity = identity;

  rv = _SendMsg(deliverMode, identity, accountKey, entityConversionDone);
  if (NS_FAILED(rv))
  {
    nsCOMPtr<nsIMsgSendReport> sendReport;
    if (mMsgSend)
      mMsgSend->GetSendReport(getter_AddRefs(sendReport));
    if (sendReport)
    {
      nsresult theError;
      sendReport->DisplayReport(prompt, PR_TRUE, PR_TRUE, &theError);
    }
    else
    {
      /* If we come here it's because we got an error before we could intialize a
         send report! Let's try our best...
      */
      switch (deliverMode)
      {
        case nsIMsgCompDeliverMode::Later:
          nsMsgDisplayMessageByID(prompt, NS_MSG_UNABLE_TO_SEND_LATER);
          break;
        case nsIMsgCompDeliverMode::AutoSaveAsDraft:
        case nsIMsgCompDeliverMode::SaveAsDraft:
          nsMsgDisplayMessageByID(prompt, NS_MSG_UNABLE_TO_SAVE_DRAFT);
          break;
        case nsIMsgCompDeliverMode::SaveAsTemplate:
          nsMsgDisplayMessageByID(prompt, NS_MSG_UNABLE_TO_SAVE_TEMPLATE);
          break;

        default:
          nsMsgDisplayMessageByID(prompt, NS_ERROR_SEND_FAILED);
          break;
      }
    }

    if (progress)
      progress->CloseProgressDialog(PR_TRUE);
  }

  return rv;
}

// XXX when do we break this ref to the listener?
NS_IMETHODIMP nsMsgCompose::SetRecyclingListener(nsIMsgComposeRecyclingListener *aRecyclingListener)
{
  mRecyclingListener = aRecyclingListener;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::GetRecyclingListener(nsIMsgComposeRecyclingListener **aRecyclingListener)
{
  NS_ENSURE_ARG_POINTER(aRecyclingListener);
  *aRecyclingListener = mRecyclingListener;
  NS_IF_ADDREF(*aRecyclingListener);
  return NS_OK;
}

/* attribute boolean recycledWindow; */
NS_IMETHODIMP nsMsgCompose::GetRecycledWindow(PRBool *aRecycledWindow)
{
  NS_ENSURE_ARG_POINTER(aRecycledWindow);
  *aRecycledWindow = mRecycledWindow;
  return NS_OK;
}
NS_IMETHODIMP nsMsgCompose::SetRecycledWindow(PRBool aRecycledWindow)
{
  mRecycledWindow = aRecycledWindow;
  return NS_OK;
}

/* attribute boolean deleteDraft */
NS_IMETHODIMP nsMsgCompose::GetDeleteDraft(PRBool *aDeleteDraft)
{
  NS_ENSURE_ARG_POINTER(aDeleteDraft);
  *aDeleteDraft = mDeleteDraft;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::SetDeleteDraft(PRBool aDeleteDraft)
{
  mDeleteDraft = aDeleteDraft;
  return NS_OK;
}

PRBool nsMsgCompose::IsLastWindow()
{
  nsresult rv;
  PRBool more;
  nsCOMPtr<nsIWindowMediator> windowMediator =
              do_GetService(NS_WINDOWMEDIATOR_CONTRACTID, &rv);
  if (NS_SUCCEEDED(rv))
  {
    nsCOMPtr<nsISimpleEnumerator> windowEnumerator;
    rv = windowMediator->GetEnumerator(nsnull,
               getter_AddRefs(windowEnumerator));
    if (NS_SUCCEEDED(rv))
    {
      nsCOMPtr<nsISupports> isupports;

      if (NS_SUCCEEDED(windowEnumerator->GetNext(getter_AddRefs(isupports))))
        if (NS_SUCCEEDED(windowEnumerator->HasMoreElements(&more)))
          return !more;
    }
  }
  return PR_TRUE;
}

NS_IMETHODIMP nsMsgCompose::CloseWindow(PRBool recycleIt)
{
  nsresult rv;

  nsCOMPtr<nsIMsgComposeService> composeService = do_GetService(NS_MSGCOMPOSESERVICE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv,rv);

  // unregister the compose object with the compose service
  rv = composeService->UnregisterComposeWindow(m_window);
  NS_ENSURE_SUCCESS(rv, rv);

  recycleIt = recycleIt && !IsLastWindow();
  if (recycleIt)
  {
    rv = composeService->CacheWindow(m_window, m_composeHTML, mRecyclingListener);
    if (NS_SUCCEEDED(rv))
    {
      nsCOMPtr<nsIHTMLEditor> htmlEditor (do_QueryInterface(m_editor));
      NS_ASSERTION(htmlEditor, "no editor");
      if (htmlEditor)
      {
        // XXX clear undo txn manager?

        rv = m_editor->EnableUndo(PR_FALSE);
        NS_ENSURE_SUCCESS(rv,rv);

        rv = htmlEditor->RebuildDocumentFromSource(EmptyString());
        NS_ENSURE_SUCCESS(rv,rv);

        rv = m_editor->EnableUndo(PR_TRUE);
        NS_ENSURE_SUCCESS(rv,rv);

        SetBodyModified(PR_FALSE);
      }
      if (mRecyclingListener)
      {
        mRecyclingListener->OnClose();

        /**
         * In order to really free the memory, we need to call the JS garbage collector for our window.
         * If we don't call GC, the nsIMsgCompose object held by JS will not be released despite we set
         * the JS global that held it to null. Each time we reopen a recycled window, we allocate a new
         * nsIMsgCompose that we really need to be released when we recycle the window. In fact despite
         * we call GC here, the release won't occur right away. But if we don't call it, the release
         * will happen only when we physically close the window which will happen only on quit.
         */
        nsCOMPtr<nsIScriptGlobalObject> sgo(do_QueryInterface(m_window));
        if (sgo)
        {
          nsIScriptContext *scriptContext = sgo->GetContext();
          if (scriptContext)
            scriptContext->GC();
        }
      }
      return NS_OK;
    }
  }

  //We are going away for real, we need to do some clean up first
  if (m_baseWindow)
  {
    if (m_editor)
    {
        /* The editor will be destroyed during yje close window.
         * Set it to null to be sure we won't use it anymore
         */
      m_editor = nsnull;
    }
    nsIBaseWindow * window = m_baseWindow;
    m_baseWindow = nsnull;
    rv = window->Destroy();
  }

  return rv;
}

nsresult nsMsgCompose::Abort()
{
  if (mMsgSend)
    mMsgSend->Abort();

  if (mProgress)
    mProgress->CloseProgressDialog(PR_TRUE);

  return NS_OK;
}

nsresult nsMsgCompose::GetEditor(nsIEditor * *aEditor)
{
  NS_IF_ADDREF(*aEditor = m_editor);
  return NS_OK;
}

nsresult nsMsgCompose::ClearEditor()
{
  m_editor = nsnull;
  return NS_OK;
}

// This used to be called BEFORE editor was created
//  (it did the loadUrl that triggered editor creation)
// It is called from JS after editor creation
//  (loadUrl is done in JS)
NS_IMETHODIMP nsMsgCompose::InitEditor(nsIEditor* aEditor, nsIDOMWindow* aContentWindow)
{
  NS_ENSURE_ARG_POINTER(aEditor);
  NS_ENSURE_ARG_POINTER(aContentWindow);

  m_editor = aEditor;

  // Set the charset
  const nsDependentCString msgCharSet(m_compFields->GetCharacterSet());
  m_editor->SetDocumentCharacterSet(msgCharSet);

  nsCOMPtr<nsPIDOMWindow> window = do_QueryInterface(aContentWindow);

  nsIDocShell *docShell = window->GetDocShell();
  NS_ENSURE_TRUE(docShell, NS_ERROR_UNEXPECTED);

  nsCOMPtr<nsIContentViewer> childCV;
  NS_ENSURE_SUCCESS(docShell->GetContentViewer(getter_AddRefs(childCV)), NS_ERROR_FAILURE);
  if (childCV)
  {
    nsCOMPtr<nsIMarkupDocumentViewer> markupCV = do_QueryInterface(childCV);
    if (markupCV) {
      NS_ENSURE_SUCCESS(markupCV->SetDefaultCharacterSet(msgCharSet), NS_ERROR_FAILURE);
      NS_ENSURE_SUCCESS(markupCV->SetForceCharacterSet(msgCharSet), NS_ERROR_FAILURE);
    }
  }

  // This is what used to be done in mDocumentListener,
  //   nsMsgDocumentStateListener::NotifyDocumentCreated()
  PRBool quotingToFollow = PR_FALSE;
  GetQuotingToFollow(&quotingToFollow);
  if (quotingToFollow)
    return BuildQuotedMessageAndSignature();
  else
  {
    NotifyStateListeners(nsIMsgComposeNotificationType::ComposeFieldsReady, NS_OK);
    nsresult rv = BuildBodyMessageAndSignature();
    NotifyStateListeners(nsIMsgComposeNotificationType::ComposeBodyReady, NS_OK);
    return rv;
  }
}

nsresult nsMsgCompose::GetBodyModified(PRBool * modified)
{
  nsresult rv;

  if (! modified)
    return NS_ERROR_NULL_POINTER;

  *modified = PR_TRUE;

  if (m_editor)
  {
    rv = m_editor->GetDocumentModified(modified);
    if (NS_FAILED(rv))
      *modified = PR_TRUE;
  }

  return NS_OK;
}

nsresult nsMsgCompose::SetBodyModified(PRBool modified)
{
  nsresult  rv = NS_OK;

  if (m_editor)
  {
    if (modified)
    {
      PRInt32  modCount = 0;
      m_editor->GetModificationCount(&modCount);
      if (modCount == 0)
        m_editor->IncrementModificationCount(1);
    }
    else
      m_editor->ResetModificationCount();
  }

  return rv;
}

NS_IMETHODIMP
nsMsgCompose::GetDomWindow(nsIDOMWindowInternal * *aDomWindow)
{
  NS_IF_ADDREF(*aDomWindow = m_window);
  return NS_OK;
}

nsresult nsMsgCompose::GetCompFields(nsIMsgCompFields * *aCompFields)
{
  *aCompFields = (nsIMsgCompFields*)m_compFields;
  NS_IF_ADDREF(*aCompFields);
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::GetComposeHTML(PRBool *aComposeHTML)
{
  *aComposeHTML = m_composeHTML;
  return NS_OK;
}

nsresult nsMsgCompose::GetWrapLength(PRInt32 *aWrapLength)
{
  nsresult rv;
  nsCOMPtr<nsIPrefBranch> prefBranch (do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  if (NS_FAILED(rv)) return rv;

  return prefBranch->GetIntPref("mailnews.wraplength", aWrapLength);
}

nsresult nsMsgCompose::CreateMessage(const char * originalMsgURI,
                                     MSG_ComposeType type,
                                     nsIMsgCompFields * compFields)
{
  nsresult rv = NS_OK;

  mType = type;
  mDraftDisposition = nsIMsgFolder::nsMsgDispositionState_None;

  mDeleteDraft = (type == nsIMsgCompType::Draft);
  nsCAutoString msgUri(originalMsgURI);
  // check if we're dealing with an opened .eml file msg
  PRBool fileUrl = StringBeginsWith(msgUri, NS_LITERAL_CSTRING("file:"));
  if (fileUrl)
  {
    // strip out ?type=application/x-message-display because it confuses libmime
    PRInt32 typeIndex = msgUri.Find("?type=application/x-message-display");
    if (typeIndex != kNotFound)
    {
      msgUri.Cut(typeIndex, sizeof("?type=application/x-message-display") - 1);
      // we also need to replace the next '&' with '?'
      if (msgUri.CharAt(typeIndex) == '&')
        msgUri.SetCharAt('?', typeIndex);
      originalMsgURI = msgUri.get();
    }
  }
  else // check if we're dealing with a displayed message/rfc822 attachment
  {
    PRInt32 typeIndex = msgUri.Find("&type=application/x-message-display");
    if (typeIndex != kNotFound)
    {
      msgUri.Cut(typeIndex, sizeof("&type=application/x-message-display") - 1);
      // nsURLFetcher will check for "realtype=message/rfc822" and will set the
      // content type to message/rfc822 in the forwarded message.
      msgUri.Append("&realtype=message/rfc822");
      originalMsgURI = msgUri.get();
    }
  }
  if (compFields)
  {
    NS_IF_RELEASE(m_compFields);
    m_compFields = reinterpret_cast<nsMsgCompFields*>(compFields);
    NS_ADDREF(m_compFields);
  }
  else
  {
    NS_NEWXPCOM(m_compFields, nsMsgCompFields);
    if (m_compFields)
      NS_ADDREF(m_compFields);
    else
      return NS_ERROR_OUT_OF_MEMORY;
  }

  nsCOMPtr<nsIMsgHeaderParser> parser =
    do_GetService(NS_MAILNEWS_MIME_HEADER_PARSER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  if (m_identity)
  {
    /* Setup reply-to field */
    nsCString replyTo;
    m_identity->GetReplyTo(replyTo);
    if (!replyTo.IsEmpty())
    {
      nsCString resultStr;
      rv = parser->RemoveDuplicateAddresses(nsDependentCString(m_compFields->GetReplyTo()),
                                            replyTo, resultStr);
      if (NS_SUCCEEDED(rv) && !resultStr.IsEmpty())
      {
        replyTo.Append(',');
        replyTo.Append(resultStr);
      }
      m_compFields->SetReplyTo(replyTo.get());
    }

    /* Setup bcc field */
    PRBool doBcc;
    m_identity->GetDoBcc(&doBcc);
    if (doBcc) 
    {
      nsCString bccList;
      m_identity->GetDoBccList(bccList);

      nsCString resultStr;
      rv = parser->RemoveDuplicateAddresses(nsDependentCString(m_compFields->GetBcc()),
                                            bccList, resultStr);
      if (NS_SUCCEEDED(rv) && !resultStr.IsEmpty())
      {
        bccList.Append(',');
        bccList.Append(resultStr);
      }
      m_compFields->SetBcc(bccList.get());
    }
  }

  if (mType == nsIMsgCompType::Draft)
  {
    nsCString curDraftIdURL;

    rv = m_compFields->GetDraftId(getter_Copies(curDraftIdURL));
    NS_ASSERTION(NS_SUCCEEDED(rv) && !curDraftIdURL.IsEmpty(), "RemoveCurrentDraftMessage can't get draft id");

    // Skip if no draft id (probably a new draft msg).
    if (NS_SUCCEEDED(rv) && !curDraftIdURL.IsEmpty())
    {
      nsCOMPtr <nsIMsgDBHdr> msgDBHdr;
      rv = GetMsgDBHdrFromURI(curDraftIdURL.get(), getter_AddRefs(msgDBHdr));
      NS_ASSERTION(NS_SUCCEEDED(rv), "RemoveCurrentDraftMessage can't get msg header DB interface pointer.");
      if (msgDBHdr)
      {
        nsCString queuedDisposition;
        msgDBHdr->GetStringProperty(QUEUED_DISPOSITION_PROPERTY, getter_Copies(queuedDisposition));
        nsCString originalMsgURIs;
        msgDBHdr->GetStringProperty(ORIG_URI_PROPERTY, getter_Copies(originalMsgURIs));
        mOriginalMsgURI = originalMsgURIs;
        if (!queuedDisposition.IsEmpty())
        {
          if (queuedDisposition.Equals("replied"))
             mDraftDisposition = nsIMsgFolder::nsMsgDispositionState_Replied;
          else if (queuedDisposition.Equals("forward"))
             mDraftDisposition = nsIMsgFolder::nsMsgDispositionState_Forwarded;
        }
      }
    }
  }

  // If we don't have an original message URI, nothing else to do...
  if (!originalMsgURI || *originalMsgURI == 0)
    return NS_OK;

  // store the original message URI so we can extract it after we send the message to properly
  // mark any disposition flags like replied or forwarded on the message.
  if (mOriginalMsgURI.IsEmpty())
    mOriginalMsgURI = originalMsgURI;

  nsCOMPtr<nsIPrefBranch> prefs (do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  // If we are forwarding inline, mime did already setup the compose fields therefore we should stop now
  if (type == nsIMsgCompType::ForwardInline )
  {
    PRBool replyInDefault = PR_FALSE;
    prefs->GetBoolPref("mailnews.reply_in_default_charset",
                        &replyInDefault);
    // Use send_default_charset if reply_in_default_charset is on.
    if (replyInDefault)
    {
      nsString str;
      nsCString charset;
      NS_GetLocalizedUnicharPreferenceWithDefault(prefs, "mailnews.send_default_charset",
                                                  EmptyString(), str);
      if (!str.IsEmpty())
      {
        LossyCopyUTF16toASCII(str, charset);
        m_compFields->SetCharacterSet(charset.get());
      }
    }
    return rv;
  }

  char *uriList = PL_strdup(originalMsgURI);
  if (!uriList)
    return NS_ERROR_OUT_OF_MEMORY;

  nsCOMPtr<nsIMimeConverter> mimeConverter = do_GetService(NS_MIME_CONVERTER_CONTRACTID);

  nsCString charset;
  // use a charset of the original message
  nsCString mailCharset;
  PRBool charsetOverride = PR_FALSE;
  GetTopmostMsgWindowCharacterSet(mailCharset, &mCharsetOverride);
  if (!mailCharset.IsEmpty())
  {
    charset = mailCharset;
    charsetOverride = mCharsetOverride;
  }
#ifdef DEBUG_jungshik
  printf ("charset=%s\n", charset.get());
  printf ("charsetOverride=%d\n", charsetOverride);
#endif

  // although the charset in which to _send_ the message might change,
  // the original message will be parsed for quoting using the charset it is
  // now displayed with
  mQuoteCharset = charset;

  PRBool isFirstPass = PR_TRUE;
  char *uri = uriList;
  char *nextUri;
  do
  {
    nextUri = strstr(uri, "://");
    if (nextUri)
    {
      // look for next ://, and then back up to previous ','
      nextUri = strstr(nextUri + 1, "://");
      if (nextUri)
      {
        *nextUri = '\0';
        char *saveNextUri = nextUri;
        nextUri = strrchr(uri, ',');
        if (nextUri)
          *nextUri = '\0';
        *saveNextUri = ':';
      }
    }

    nsCOMPtr <nsIMsgDBHdr> msgHdr;
    if (mOrigMsgHdr)
      msgHdr = mOrigMsgHdr;
    else
    {
      rv = GetMsgDBHdrFromURI(uri, getter_AddRefs(msgHdr));
      NS_ENSURE_SUCCESS(rv,rv);
    }
    if (msgHdr)
    {
      nsString subject;
      nsCString decodedCString;

      if (!charsetOverride && charset.IsEmpty())
      {
        rv = msgHdr->GetCharset(getter_Copies(charset));
        if (NS_FAILED(rv)) return rv;
      }

      // save the charset of a message being replied to because
      // we need to use it when decoding RFC-2047-encoded author name
      // with |charsetOverride == PR_TRUE|
      nsCAutoString originCharset(charset);

      PRBool replyInDefault = PR_FALSE;
      prefs->GetBoolPref("mailnews.reply_in_default_charset",
                          &replyInDefault);
      // Use send_default_charset if reply_in_default_charset is on.
      if (replyInDefault)
      {
        nsString str;
        NS_GetLocalizedUnicharPreferenceWithDefault(prefs, "mailnews.send_default_charset",
                                                    EmptyString(), str);
        if (!str.IsEmpty())
          LossyCopyUTF16toASCII(str, charset);
      }

      // No matter what, we should block x-windows-949 (our internal name)
      // from being used for outgoing emails (bug 234958)
      if (charset.Equals("x-windows-949",
            nsCaseInsensitiveCStringComparator()))
        charset = "EUC-KR";

      // get an original charset, used for a label, UTF-8 is used for the internal processing
      if (isFirstPass && !charset.IsEmpty())
        m_compFields->SetCharacterSet(charset.get());

      nsCString subjectCStr;
      (void) msgHdr->GetSubject(getter_Copies(subjectCStr));
      rv = mimeConverter->DecodeMimeHeader(subjectCStr.get(), originCharset.get(),
                                           charsetOverride, PR_TRUE, subject);
      if (NS_FAILED(rv)) return rv;

      // Check if (was: is present in the subject
      PRInt32 wasOffset = subject.RFind(NS_LITERAL_STRING(" (was:"));
      PRBool strip = PR_TRUE;

      if (wasOffset >= 0) {
        // Check the number of references, to check if was: should be stripped
        // First, assume that it should be stripped; the variable will be set to
        // false later if stripping should not happen.
        PRUint16 numRef;
        msgHdr->GetNumReferences(&numRef);
        if (numRef) {
          // If there are references, look for the first message in the thread
          // firstly, get the database via the folder
          nsCOMPtr<nsIMsgFolder> folder;
          msgHdr->GetFolder(getter_AddRefs(folder));
          if (folder) {
            nsCOMPtr<nsIMsgDatabase> db;
            folder->GetMsgDatabase(getter_AddRefs(db));

            if (db) {
              nsCAutoString reference;
              msgHdr->GetStringReference(0, reference);

              nsCOMPtr<nsIMsgDBHdr> refHdr;
              db->GetMsgHdrForMessageID(reference.get(), getter_AddRefs(refHdr));

              if (refHdr) {
                nsCString refSubject;
                rv = refHdr->GetSubject(getter_Copies(refSubject));
                if (NS_SUCCEEDED(rv)) {
                  if (refSubject.Find(" (was:") >= 0)
                    strip = PR_FALSE;
                }
              }
            }
          }
        }
        else
          strip = PR_FALSE;
      }

      if (strip && wasOffset >= 0) {
        // Strip off the "(was: old subject)" part
        subject.Assign(Substring(subject, 0, wasOffset));
      }

      switch (type)
      {
        default: break;
        case nsIMsgCompType::Reply :
        case nsIMsgCompType::ReplyAll:
        case nsIMsgCompType::ReplyToList:
        case nsIMsgCompType::ReplyToGroup:
        case nsIMsgCompType::ReplyToSender:
        case nsIMsgCompType::ReplyToSenderAndGroup:
          {
            if (!isFirstPass)       // safeguard, just in case...
            {
              PR_Free(uriList);
              return rv;
            }
            mQuotingToFollow = PR_TRUE;

            subject.Insert(NS_LITERAL_STRING("Re: "), 0);
            m_compFields->SetSubject(subject);

            nsCString author, authorEmailAddress;
            msgHdr->GetAuthor(getter_Copies(author));

            nsCString recipients, recipientsEmailAddresses;
            msgHdr->GetRecipients(getter_Copies(recipients));

            nsCString ccList, ccListEmailAddresses;
            msgHdr->GetCcList(getter_Copies(ccList));

            nsCOMPtr<nsIMsgHeaderParser> parser (do_GetService(NS_MAILNEWS_MIME_HEADER_PARSER_CONTRACTID));
            if (parser) {
              // convert to UTF8 before passing to MakeFullAddress
              rv = parser->ExtractHeaderAddressMailboxes(author,
                                                         authorEmailAddress);
              NS_ENSURE_SUCCESS(rv,rv);

              rv = parser->ExtractHeaderAddressMailboxes(recipients,
                                                         recipientsEmailAddresses);
              NS_ENSURE_SUCCESS(rv,rv);

              rv = parser->ExtractHeaderAddressMailboxes(ccList,
                                                         ccListEmailAddresses);
              NS_ENSURE_SUCCESS(rv,rv);
            }

            PRBool replyToSelfCheckAll = PR_FALSE;
            prefs->GetBoolPref("mailnews.reply_to_self_check_all_ident",
                               &replyToSelfCheckAll);

            nsCOMPtr<nsIMsgAccountManager> accountManager = do_GetService(NS_MSGACCOUNTMANAGER_CONTRACTID, &rv);
            NS_ENSURE_SUCCESS(rv,rv);

            nsCOMPtr<nsISupportsArray> identities;
            nsCString accountKey;
            msgHdr->GetAccountKey(getter_Copies(accountKey));
            if(replyToSelfCheckAll)
            {
              // check all avaliable identities if the pref was set
              accountManager->GetAllIdentities(getter_AddRefs(identities));
            }
            else if (!accountKey.IsEmpty())
            {
               // check headers to see which account the message came in from (only works for pop3)
              nsCOMPtr<nsIMsgAccount> account;
              accountManager->GetAccount(accountKey, getter_AddRefs(account));

              if(account)
                account->GetIdentities(getter_AddRefs(identities));
            }
            else
            {
              // check identities only for the server of the folder that the message is in
              nsCOMPtr <nsIMsgFolder> msgFolder;
              rv = msgHdr->GetFolder(getter_AddRefs(msgFolder));

              if (NS_SUCCEEDED(rv) && msgFolder){
                nsCOMPtr<nsIMsgIncomingServer> nsIMsgIncomingServer;
                rv = msgFolder->GetServer(getter_AddRefs(nsIMsgIncomingServer));

                if(NS_SUCCEEDED(rv) && nsIMsgIncomingServer)
                  accountManager->GetIdentitiesForServer(nsIMsgIncomingServer, getter_AddRefs(identities));
              }
            }

            PRBool isReplyToOwnMsg = PR_FALSE;
            if(identities)
            {
              // go through the identities to see if any of them is the author of the email
              nsCOMPtr<nsIMsgIdentity> lookupIdentity;

              PRUint32 count = 0;
              identities->Count(&count);

              for (PRUint32 i = 0; i < count; i++)
              {
                rv = identities->QueryElementAt(i, NS_GET_IID(nsIMsgIdentity),
                                          getter_AddRefs(lookupIdentity));
                if (NS_FAILED(rv))
                  continue;

                nsCString curIdentityEmail;
                lookupIdentity->GetEmail(curIdentityEmail);

                // See if it's a reply to own message, but not a reply between identities.
                if (curIdentityEmail.Equals(authorEmailAddress))
                {
                  isReplyToOwnMsg = PR_TRUE;
                  // For a true reply-to-self, none of your identities are in To or CC.
                  for (PRUint32 j = 0; j < count; j++)
                  {
                    nsCOMPtr<nsIMsgIdentity> lookupIdentity2;
                    rv = identities->QueryElementAt(j, NS_GET_IID(nsIMsgIdentity),
                                                    getter_AddRefs(lookupIdentity2));
                    if (NS_FAILED(rv))
                      continue;

                    nsCString curIdentityEmail2;
                    lookupIdentity2->GetEmail(curIdentityEmail2);
                    if (FindInReadable(curIdentityEmail2, recipientsEmailAddresses) ||
                        FindInReadable(curIdentityEmail2, ccListEmailAddresses))
                    {
                      // An identity among the recipients -> not reply-to-self.
                      isReplyToOwnMsg = PR_FALSE;
                      break;
                    }
                  }
                  break;
                }
              }
            }

            nsCString toField;
            if (isReplyToOwnMsg)
              msgHdr->GetRecipients(getter_Copies(toField));
            else
              toField.Assign(author);

            ConvertRawBytesToUTF8(toField, originCharset.get(), decodedCString);
            m_compFields->SetSenderReply(decodedCString.get());
            m_compFields->SetTo(decodedCString.get());

            // Setup quoting callbacks for later...
            mWhatHolder = 1;
            break;
          }
        case nsIMsgCompType::ForwardAsAttachment:
          {
            PRUint32 flags;

            msgHdr->GetFlags(&flags);
            if (flags & nsMsgMessageFlags::HasRe)
              subject.Insert(NS_LITERAL_STRING("Re: "), 0);

            // Setup quoting callbacks for later...
            mQuotingToFollow = PR_FALSE;  //We don't need to quote the original message.
            nsCOMPtr<nsIMsgAttachment> attachment = do_CreateInstance(NS_MSGATTACHMENT_CONTRACTID, &rv);
            if (NS_SUCCEEDED(rv) && attachment)
            {
              PRBool addExtension = PR_TRUE;
              nsString sanitizedSubj;
              prefs->GetBoolPref("mail.forward_add_extension", &addExtension);

              // copy subject string to sanitizedSubj, use default if empty
              if (subject.IsEmpty())
              {
                nsresult rv;
                nsCOMPtr<nsIStringBundleService> bundleService = do_GetService(NS_STRINGBUNDLE_CONTRACTID, &rv);
                NS_ENSURE_SUCCESS(rv, rv);
                nsCOMPtr<nsIStringBundle> composeBundle;
                rv = bundleService->CreateBundle("chrome://messenger/locale/messengercompose/composeMsgs.properties",
                                                 getter_AddRefs(composeBundle));
                NS_ENSURE_SUCCESS(rv, rv);
                composeBundle->GetStringFromName(NS_LITERAL_STRING("messageAttachmentSafeName").get(),
                                                 getter_Copies(sanitizedSubj));
              }
              else
                sanitizedSubj.Assign(subject);

              // change all '.' to '_'  see bug #271211
              sanitizedSubj.ReplaceChar('.', '_');
              attachment->SetName(addExtension ? sanitizedSubj + NS_LITERAL_STRING(".eml") : sanitizedSubj);
              attachment->SetUrl(uri);
              m_compFields->AddAttachment(attachment);
            }

            if (isFirstPass)
            {
              nsCString fwdPrefix;
              prefs->GetCharPref("mail.forward_subject_prefix", getter_Copies(fwdPrefix));
              if (!fwdPrefix.IsEmpty())
              {
                nsString unicodeFwdPrefix;
                CopyUTF8toUTF16(fwdPrefix, unicodeFwdPrefix);
                unicodeFwdPrefix.AppendLiteral(": ");
                subject.Insert(unicodeFwdPrefix, 0);
              }
              else
              {
                subject.Insert(NS_LITERAL_STRING("Fwd: "), 0);
              }
              m_compFields->SetSubject(subject);
            }
            break;
          }
        case nsIMsgCompType::Redirect:
          {
            // For a redirect, set the Reply-To: header to what was in the original From: header...
            nsCAutoString author;
            msgHdr->GetAuthor(getter_Copies(author));
            m_compFields->SetReplyTo(author.get());

            // ... and empty out the various recipient headers
            nsAutoString empty;
            m_compFields->SetTo(empty);
            m_compFields->SetCc(empty);
            m_compFields->SetBcc(empty);
            m_compFields->SetNewsgroups(empty);
            m_compFields->SetFollowupTo(empty);
          }
      }
    }
    isFirstPass = PR_FALSE;
    uri = nextUri + 1;
  }
  while (nextUri);
  PR_Free(uriList);
  return rv;
}

NS_IMETHODIMP nsMsgCompose::GetProgress(nsIMsgProgress **_retval)
{
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = mProgress;
  NS_IF_ADDREF(*_retval);
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::GetMessageSend(nsIMsgSend **_retval)
{
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = mMsgSend;
  NS_IF_ADDREF(*_retval);
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::SetCiteReference(nsString citeReference)
{
  mCiteReference = citeReference;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::SetSavedFolderURI(const char *folderURI)
{
  m_folderName = folderURI;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::GetSavedFolderURI(char ** folderURI)
{
  NS_ENSURE_ARG_POINTER(folderURI);
  *folderURI = ToNewCString(m_folderName);
  return (*folderURI) ? NS_OK : NS_ERROR_OUT_OF_MEMORY;
}

NS_IMETHODIMP nsMsgCompose::GetOriginalMsgURI(char ** originalMsgURI)
{
  NS_ENSURE_ARG_POINTER(originalMsgURI);
  *originalMsgURI = ToNewCString(mOriginalMsgURI);
  return (*originalMsgURI) ? NS_OK : NS_ERROR_OUT_OF_MEMORY;
}

////////////////////////////////////////////////////////////////////////////////////
// THIS IS THE CLASS THAT IS THE STREAM CONSUMER OF THE HTML OUPUT
// FROM LIBMIME. THIS IS FOR QUOTING
////////////////////////////////////////////////////////////////////////////////////
QuotingOutputStreamListener::~QuotingOutputStreamListener()
{
  if (mUnicodeConversionBuffer)
    nsMemory::Free(mUnicodeConversionBuffer);
}

QuotingOutputStreamListener::QuotingOutputStreamListener(const char * originalMsgURI,
                                                         nsIMsgDBHdr *originalMsgHdr,
                                                         PRBool quoteHeaders,
                                                         PRBool headersOnly,
                                                         nsIMsgIdentity *identity,
                                                         const char *charset,
                                                         PRBool charetOverride,
                                                         PRBool quoteOriginal,
                                                         const nsACString& htmlToQuote)
{
  nsresult rv;
  mQuoteHeaders = quoteHeaders;
  mHeadersOnly = headersOnly;
  mIdentity = identity;
  mUnicodeBufferCharacterLength = 0;
  mUnicodeConversionBuffer = nsnull;
  mQuoteOriginal = quoteOriginal;
  mHtmlToQuote = htmlToQuote;

  if (!mHeadersOnly || !mHtmlToQuote.IsEmpty())
  {
    nsString replyHeaderOriginalmessage;
    // For the built message body...
    if (originalMsgHdr && !quoteHeaders)
    {
      // Setup the cite information....
      nsCString myGetter;
      if (NS_SUCCEEDED(originalMsgHdr->GetMessageId(getter_Copies(myGetter))))
      {
        if (!myGetter.IsEmpty())
        {
          nsCAutoString buf;
          mCiteReference.AssignLiteral("mid:");
          AppendASCIItoUTF16(NS_EscapeURL(myGetter, esc_FileBaseName | esc_Forced, buf),
                             mCiteReference);
        }
      }

      PRInt32 reply_on_top = 0;
      mIdentity->GetReplyOnTop(&reply_on_top);
      if (reply_on_top == 1)
      {
        // add one newline if a signature comes before the quote, two otherwise
        PRBool includeSignature = PR_TRUE;
        PRBool sig_bottom = PR_TRUE;
        PRBool attachFile = PR_FALSE;
        nsString prefSigText;

        mIdentity->GetSigOnReply(&includeSignature);
        mIdentity->GetSigBottom(&sig_bottom);
        mIdentity->GetHtmlSigText(prefSigText);
        rv = mIdentity->GetAttachSignature(&attachFile);
        if (includeSignature && !sig_bottom &&
            ((NS_SUCCEEDED(rv) && attachFile) || !prefSigText.IsEmpty()))
          mCitePrefix.AppendLiteral("\n");
        else
          mCitePrefix.AppendLiteral("\n\n");
      }


      PRBool header, headerDate;
      PRInt32 replyHeaderType;
      nsAutoString replyHeaderLocale;
      nsString replyHeaderAuthorwrote;
      nsString replyHeaderOndate;
      nsAutoString replyHeaderSeparator;
      nsAutoString replyHeaderColon;

      // Get header type, locale and strings from pref.
      GetReplyHeaderInfo(&replyHeaderType,
                         replyHeaderLocale,
                         replyHeaderAuthorwrote,
                         replyHeaderOndate,
                         replyHeaderSeparator,
                         replyHeaderColon,
                         replyHeaderOriginalmessage);

      switch (replyHeaderType)
      {
        case 0: // No reply header at all
          header=PR_FALSE;
          headerDate=PR_FALSE;
          break;

        case 2: // Insert both the original author and date in the reply header (date followed by author)
        case 3: // Insert both the original author and date in the reply header (author followed by date)
          header=PR_TRUE;
          headerDate=PR_TRUE;
          break;

        case 4: // XXX implement user specified header
        case 1: // Default is to only view the author. We will reconsider this decision when bug 75377 is fixed.
        default:
          header=PR_TRUE;
          headerDate=PR_FALSE;
          break;
      }

      nsAutoString citePrefixDate;
      nsAutoString citePrefixAuthor;

      if (header)
      {
        if (headerDate)
        {
          nsCOMPtr<nsIDateTimeFormat> dateFormatter = do_CreateInstance(NS_DATETIMEFORMAT_CONTRACTID, &rv);

          if (NS_SUCCEEDED(rv))
          {
            PRTime originalMsgDate;
            rv = originalMsgHdr->GetDate(&originalMsgDate);

            if (NS_SUCCEEDED(rv))
            {
              nsAutoString formattedDateString;
              nsCOMPtr<nsILocale> locale;
              nsCOMPtr<nsILocaleService> localeService(do_GetService(NS_LOCALESERVICE_CONTRACTID));

              // Format date using "mailnews.reply_header_locale", if empty then use application default locale.
              if (!replyHeaderLocale.IsEmpty())
                rv = localeService->NewLocale(replyHeaderLocale, getter_AddRefs(locale));

              if (NS_SUCCEEDED(rv))
              {
                rv = dateFormatter->FormatPRTime(locale,
                                                 kDateFormatShort,
                                                 kTimeFormatNoSeconds,
                                                 originalMsgDate,
                                                 formattedDateString);

                if (NS_SUCCEEDED(rv))
                {
                  // take care "On %s"
                  PRUnichar *formatedString = nsnull;
                  formatedString = nsTextFormatter::smprintf(replyHeaderOndate.get(),
                                                             NS_ConvertUTF16toUTF8(formattedDateString.get()).get());
                  if (formatedString)
                  {
                    citePrefixDate.Assign(formatedString);
                    nsTextFormatter::smprintf_free(formatedString);
                  }
                }
              }
            }
          }
        }


      nsCString author;
      rv = originalMsgHdr->GetAuthor(getter_Copies(author));

      if (NS_SUCCEEDED(rv))
      {
        mMimeConverter = do_GetService(NS_MIME_CONVERTER_CONTRACTID);
        nsCOMPtr<nsIMsgHeaderParser> parser (do_GetService(NS_MAILNEWS_MIME_HEADER_PARSER_CONTRACTID));

        if (parser)
        {
          nsCString authorName;
          rv = parser->ExtractHeaderAddressName(author, authorName);
          // take care "%s wrote"
          PRUnichar *formattedString = nsnull;
          if (NS_SUCCEEDED(rv) && !authorName.IsEmpty()) 
          {
            nsCString decodedAuthor;
            // Decode header, the result string is null
            // if the input is not MIME encoded ASCII.
            if (mMimeConverter)
              mMimeConverter->DecodeMimeHeaderToCharPtr(authorName.get(),
                                                        charset,
                                                        charetOverride,
                                                        PR_TRUE, 
                                                        getter_Copies(decodedAuthor));
            formattedString = nsTextFormatter::smprintf(replyHeaderAuthorwrote.get(), 
                                                        (!decodedAuthor.IsEmpty() ? 
                                                         decodedAuthor.get() : authorName.get()));
          }
          else
          {
            formattedString = nsTextFormatter::smprintf(replyHeaderAuthorwrote.get(),
                                                        author.get());
          }
          if (formattedString)
          {
            citePrefixAuthor.Assign(formattedString);
            nsTextFormatter::smprintf_free(formattedString);
          }
        }


        }
        if (replyHeaderType == 2)
        {
          mCitePrefix.Append(citePrefixDate);
          mCitePrefix.Append(replyHeaderSeparator);
          mCitePrefix.Append(citePrefixAuthor);
        }
        else if (replyHeaderType == 3)
        {
          mCitePrefix.Append(citePrefixAuthor);
          mCitePrefix.Append(replyHeaderSeparator);
          mCitePrefix.Append(citePrefixDate);
        }
        else
          mCitePrefix.Append(citePrefixAuthor);
        mCitePrefix.Append(replyHeaderColon);
      }
    }

    if (mCitePrefix.IsEmpty())
    {
      if (replyHeaderOriginalmessage.IsEmpty())
      {
        // This is not likely to happen but load the string if it's not done already.
        PRInt32 replyHeaderType;
        nsAutoString replyHeaderLocale;
        nsString replyHeaderAuthorwrote;
        nsString replyHeaderOndate;
        nsAutoString replyHeaderSeparator;
        nsAutoString replyHeaderColon;
        GetReplyHeaderInfo(&replyHeaderType,
                           replyHeaderLocale,
                           replyHeaderAuthorwrote,
                           replyHeaderOndate,
                           replyHeaderSeparator,
                           replyHeaderColon,
                           replyHeaderOriginalmessage);
      }
      mCitePrefix.AppendLiteral("\n\n");
      mCitePrefix.Append(replyHeaderOriginalmessage);
      mCitePrefix.AppendLiteral("\n");
    }
  }
}

/**
 * The formatflowed parameter directs if formatflowed should be used in the conversion.
 * format=flowed (RFC 2646) is a way to represent flow in a plain text mail, without
 * disturbing the plain text.
 */
nsresult
QuotingOutputStreamListener::ConvertToPlainText(PRBool formatflowed /* = PR_FALSE */)
{
  nsresult rv = ConvertBufToPlainText(mMsgBody, formatflowed);
  if (NS_FAILED(rv))
    return rv;
  return ConvertBufToPlainText(mSignature, formatflowed);
}

NS_IMETHODIMP QuotingOutputStreamListener::OnStartRequest(nsIRequest *request, nsISupports * /* ctxt */)
{
  return NS_OK;
}

NS_IMETHODIMP QuotingOutputStreamListener::OnStopRequest(nsIRequest *request, nsISupports *ctxt, nsresult status)
{
  nsresult rv = NS_OK;
  nsAutoString aCharset;

  if (!mHtmlToQuote.IsEmpty())
  {
    // If we had a selection in the original message to quote, we can add
    // it now that we are done ignoring the original body of the message
    nsCOMPtr<nsIInputStream> stream;
    rv = NS_NewCStringInputStream(getter_AddRefs(stream), mHtmlToQuote);
    NS_ENSURE_SUCCESS(rv, rv);

    mHeadersOnly = PR_FALSE;
    rv = OnDataAvailable(request, ctxt, stream, 0, mHtmlToQuote.Length());
    NS_ENSURE_SUCCESS(rv, rv);
  }

  nsCOMPtr<nsIMsgCompose> compose = do_QueryReferent(mWeakComposeObj);
  if (compose)
  {
    MSG_ComposeType type;
    compose->GetType(&type);

    // Assign cite information if available...
    if (!mCiteReference.IsEmpty())
      compose->SetCiteReference(mCiteReference);

    if (mHeaders && (type == nsIMsgCompType::Reply ||
                     type == nsIMsgCompType::ReplyAll ||
                     type == nsIMsgCompType::ReplyToList ||
                     type == nsIMsgCompType::ReplyToSender ||
                     type == nsIMsgCompType::ReplyToGroup ||
                     type == nsIMsgCompType::ReplyToSenderAndGroup) &&
        mQuoteOriginal)
    {
      nsCOMPtr<nsIMsgCompFields> compFields;
      compose->GetCompFields(getter_AddRefs(compFields));
      if (compFields)
      {
        aCharset.AssignLiteral("UTF-8");
        nsAutoString recipient;
        nsAutoString cc;
        nsAutoString replyTo;
        nsAutoString mailReplyTo;
        nsAutoString mailFollowupTo;
        nsAutoString newgroups;
        nsAutoString followUpTo;
        nsAutoString messageId;
        nsAutoString references;
        nsAutoString listPost;
        nsAutoString replyCompValue;
        nsCString outCString;
        PRBool needToRemoveDup = PR_FALSE;
        if (!mMimeConverter)
        {
          mMimeConverter = do_GetService(NS_MIME_CONVERTER_CONTRACTID, &rv);
          NS_ENSURE_SUCCESS(rv, rv);
        }
        nsCString charset;
        compFields->GetCharacterSet(getter_Copies(charset));

        // Populate the AllReply compField.
        mHeaders->ExtractHeader(HEADER_TO, PR_TRUE, getter_Copies(outCString));
        ConvertRawBytesToUTF16(outCString, charset.get(), recipient);
        mHeaders->ExtractHeader(HEADER_CC, PR_TRUE, getter_Copies(outCString));
        ConvertRawBytesToUTF16(outCString, charset.get(), cc);

        mHeaders->ExtractHeader(HEADER_MAIL_FOLLOWUP_TO, PR_TRUE,
                                getter_Copies(outCString));
        ConvertRawBytesToUTF16(outCString, charset.get(), mailFollowupTo);
        if (! mailFollowupTo.IsEmpty())
        {
          // handle Mail-Followup-To (http://cr.yp.to/proto/replyto.html)
          compFields->SetAllReply(mailFollowupTo);
        }
        else
        {
          // default behaviour for messages without Mail-Followup-To
          compFields->GetTo(replyCompValue);
          if (!replyCompValue.IsEmpty() && !recipient.IsEmpty())
            replyCompValue.AppendLiteral(", ");
          replyCompValue.Append(recipient);
          if (!replyCompValue.IsEmpty() && !cc.IsEmpty())
            replyCompValue.AppendLiteral(", ");
          replyCompValue.Append(cc);
          compFields->SetAllReply(replyCompValue);
        }

        if (type == nsIMsgCompType::ReplyAll)
        {
          // preserve BCC for the reply-to-self case
          mHeaders->ExtractHeader(HEADER_BCC, PR_TRUE, getter_Copies(outCString));
          if (!outCString.IsEmpty())
          {
            nsAutoString bcc;
            ConvertRawBytesToUTF16(outCString, charset.get(), bcc);
            compFields->SetBcc(bcc);
          }

          if (! mailFollowupTo.IsEmpty())
          {
            // handle Mail-Followup-To (http://cr.yp.to/proto/replyto.html)
            compFields->SetTo(mailFollowupTo);
          }
          else
          {
            // default behaviour for messages without Mail-Followup-To
            compFields->SetCc(replyCompValue);
          }

          needToRemoveDup = PR_TRUE;
        }

        mHeaders->ExtractHeader(HEADER_LIST_POST, PR_TRUE, getter_Copies(outCString));
        if (!outCString.IsEmpty())
          mMimeConverter->DecodeMimeHeader(outCString.get(), charset.get(),
                                           PR_FALSE, PR_TRUE, listPost);

        if (!listPost.IsEmpty())
        {
          PRInt32 startPos = listPost.Find("<mailto:");
          PRInt32 endPos = listPost.Find(">", PR_FALSE, startPos);
          // Extract the e-mail address.
          if (endPos > startPos)
          {
            const PRUint32 mailtoLen = strlen("<mailto:");
            listPost = Substring(listPost, startPos + mailtoLen, endPos - (startPos + mailtoLen));
            compFields->SetListReply(listPost);
            if (type == nsIMsgCompType::ReplyToList)
              compFields->SetTo(listPost);
          }
        }

        mHeaders->ExtractHeader(HEADER_REPLY_TO, PR_FALSE, getter_Copies(outCString));
        ConvertRawBytesToUTF16(outCString, charset.get(), replyTo);
        mHeaders->ExtractHeader(HEADER_MAIL_REPLY_TO, PR_TRUE, getter_Copies(outCString));
        ConvertRawBytesToUTF16(outCString, charset.get(), mailReplyTo);

        mHeaders->ExtractHeader(HEADER_NEWSGROUPS, PR_FALSE, getter_Copies(outCString));
        if (!outCString.IsEmpty())
          mMimeConverter->DecodeMimeHeader(outCString.get(), charset.get(),
                                           PR_FALSE, PR_TRUE, newgroups);

        mHeaders->ExtractHeader(HEADER_FOLLOWUP_TO, PR_FALSE, getter_Copies(outCString));
        if (!outCString.IsEmpty())
          mMimeConverter->DecodeMimeHeader(outCString.get(), charset.get(),
                                           PR_FALSE, PR_TRUE, followUpTo);

        mHeaders->ExtractHeader(HEADER_MESSAGE_ID, PR_FALSE, getter_Copies(outCString));
        if (!outCString.IsEmpty())
          mMimeConverter->DecodeMimeHeader(outCString.get(), charset.get(),
                                           PR_FALSE, PR_TRUE, messageId);

        mHeaders->ExtractHeader(HEADER_REFERENCES, PR_FALSE, getter_Copies(outCString));
        if (!outCString.IsEmpty())
          mMimeConverter->DecodeMimeHeader(outCString.get(), charset.get(),
                                           PR_FALSE, PR_TRUE, references);

        if (! mailReplyTo.IsEmpty())
        {
          // handle Mail-Reply-To (http://cr.yp.to/proto/replyto.html)
          compFields->SetSenderReply(mailReplyTo);
          needToRemoveDup = PR_TRUE;
        }
        else if (! replyTo.IsEmpty())
        {
          // default behaviour for messages without Mail-Reply-To
          compFields->SetSenderReply(replyTo);
        }

        if (! ((type == nsIMsgCompType::ReplyAll) && ! mailFollowupTo.IsEmpty()) &&
            ! ((type == nsIMsgCompType::ReplyToList) && ! listPost.IsEmpty()))
        {
          if (! mailReplyTo.IsEmpty())
          {
            // handle Mail-Reply-To (http://cr.yp.to/proto/replyto.html)
            compFields->SetTo(mailReplyTo);
            needToRemoveDup = PR_TRUE;
          }
          else if (! replyTo.IsEmpty())
          {
            // default behaviour for messages without Mail-Reply-To
            compFields->SetTo(replyTo);
            needToRemoveDup = PR_TRUE;
          }
        }

        if (! newgroups.IsEmpty())
        {
          if ((type != nsIMsgCompType::Reply) && (type != nsIMsgCompType::ReplyToSender))
            compFields->SetNewsgroups(newgroups);
          if (type == nsIMsgCompType::ReplyToGroup)
          {
            compFields->SetSenderReply(EmptyString());
            compFields->SetTo(EmptyString());
          }
        }

        if (! followUpTo.IsEmpty())
        {
          // Handle "followup-to: poster" magic keyword here
          if (followUpTo.EqualsLiteral("poster"))
          {
            nsCOMPtr<nsIDOMWindowInternal> composeWindow;
            nsCOMPtr<nsIPrompt> prompt;
            compose->GetDomWindow(getter_AddRefs(composeWindow));
            if (composeWindow)
              composeWindow->GetPrompter(getter_AddRefs(prompt));
            nsMsgDisplayMessageByID(prompt, NS_MSG_FOLLOWUPTO_ALERT);

            // If reply-to is empty, use the from header to fetch
            // the original sender's email
            if (!replyTo.IsEmpty())
            {
              compFields->SetSenderReply(replyTo);
              compFields->SetTo(replyTo);
            }
            else
            {
              mHeaders->ExtractHeader(HEADER_FROM, PR_FALSE, getter_Copies(outCString));
              if (!outCString.IsEmpty())
              {
                nsAutoString from;
                ConvertRawBytesToUTF16(outCString, charset.get(), from);
                compFields->SetSenderReply(from);
                compFields->SetTo(from);
              }
            }

            // Clear the newsgroup: header field, because followup-to: poster
            // only follows up to the original sender
            if (! newgroups.IsEmpty())
              compFields->SetNewsgroups(EmptyString());
          }
          else // Process "followup-to: newsgroup-content" here
          {
            if (type != nsIMsgCompType::ReplyToSender)
              compFields->SetNewsgroups(followUpTo);
            if (type == nsIMsgCompType::Reply)
            {
              compFields->SetSenderReply(EmptyString());
              compFields->SetTo(EmptyString());
            }
          }
        }

        if (! references.IsEmpty())
          references.Append(PRUnichar(' '));
        references += messageId;
        compFields->SetReferences(NS_LossyConvertUTF16toASCII(references).get());

        // Remove my address from Reply fields.
        nsCString resultStr;
        nsCOMPtr<nsIMsgHeaderParser> parser =
          do_GetService(NS_MAILNEWS_MIME_HEADER_PARSER_CONTRACTID, &rv);
        NS_ENSURE_SUCCESS(rv, rv);

        nsMsgCompFields* _compFields = static_cast<nsMsgCompFields*>(compFields.get());  // XXX what is this?
        if (mIdentity)
        {
          nsCString email;
          mIdentity->GetEmail(email);
          // We always need to remove dups for the Reply fields.
          rv = parser->RemoveDuplicateAddresses(nsDependentCString(_compFields->GetSenderReply()),
                                                email, resultStr);
          if (NS_SUCCEEDED(rv))
            _compFields->SetSenderReply(resultStr.get());
          rv = parser->RemoveDuplicateAddresses(nsDependentCString(_compFields->GetAllReply()),
                                                email, resultStr);
          if (NS_SUCCEEDED(rv))
            _compFields->SetAllReply(resultStr.get());
          rv = parser->RemoveDuplicateAddresses(nsDependentCString(_compFields->GetListReply()),
                                                email, resultStr);
          if (NS_SUCCEEDED(rv))
            _compFields->SetListReply(resultStr.get());
        }

        // Remove duplicate addresses between TO && CC
        if (needToRemoveDup)
        {
          nsCString addressToBeRemoved(_compFields->GetTo());
          // Remove my own address if using Mail-Followup-To (see bug 325429)
          if (mIdentity)
          {
            nsCString email;
            mIdentity->GetEmail(email);
            addressToBeRemoved.AppendLiteral(", ");
            addressToBeRemoved.Append(email);
            rv = parser->RemoveDuplicateAddresses(nsDependentCString(_compFields->GetTo()),
                                                  email, resultStr);
            if (NS_SUCCEEDED(rv))
            {
              if (type == nsIMsgCompType::ReplyAll && !mailFollowupTo.IsEmpty())
                _compFields->SetTo(resultStr.get());
            }
          }
          rv = parser->RemoveDuplicateAddresses(nsDependentCString(_compFields->GetCc()),
                                                addressToBeRemoved, resultStr);
          if (NS_SUCCEEDED(rv))
            _compFields->SetCc(resultStr.get());
        }

      }
    }

#ifdef MSGCOMP_TRACE_PERFORMANCE
    nsCOMPtr<nsIMsgComposeService> composeService (do_GetService(NS_MSGCOMPOSESERVICE_CONTRACTID));
    composeService->TimeStamp("Done with MIME. Now we're updating the UI elements", PR_FALSE);
#endif

    if (mQuoteOriginal)
      compose->NotifyStateListeners(nsIMsgComposeNotificationType::ComposeFieldsReady, NS_OK);

#ifdef MSGCOMP_TRACE_PERFORMANCE
    composeService->TimeStamp("Addressing widget, window title and focus are now set, time to insert the body", PR_FALSE);
#endif

    if (! mHeadersOnly)
      mMsgBody.AppendLiteral("</html>");

    // Now we have an HTML representation of the quoted message.
    // If we are in plain text mode, we need to convert this to plain
    // text before we try to insert it into the editor. If we don't, we
    // just get lots of HTML text in the message...not good.
    //
    // XXX not m_composeHTML? /BenB
    PRBool composeHTML = PR_TRUE;
    compose->GetComposeHTML(&composeHTML);
    if (!composeHTML)
    {
      // Downsampling. The charset should only consist of ascii.
      char *target_charset = ToNewCString(aCharset);
      PRBool formatflowed = UseFormatFlowed(target_charset);
      ConvertToPlainText(formatflowed);
      Recycle(target_charset);
    }

    compose->ProcessSignature(mIdentity, PR_TRUE, &mSignature);

    nsCOMPtr<nsIEditor> editor;
    if (NS_SUCCEEDED(compose->GetEditor(getter_AddRefs(editor))) && editor)
    {
      if (mQuoteOriginal)
        compose->ConvertAndLoadComposeWindow(mCitePrefix,
                                             mMsgBody, mSignature,
                                             PR_TRUE, composeHTML);
      else
        InsertToCompose(editor, composeHTML);
    }

    if (mQuoteOriginal)
      compose->NotifyStateListeners(nsIMsgComposeNotificationType::ComposeBodyReady, NS_OK);
  }
  return rv;
}

NS_IMETHODIMP QuotingOutputStreamListener::OnDataAvailable(nsIRequest *request,
                              nsISupports *ctxt, nsIInputStream *inStr,
                              PRUint32 sourceOffset, PRUint32 count)
{
  nsresult rv = NS_OK;
  NS_ENSURE_ARG(inStr);

  if (mHeadersOnly)
    return rv;

  char *newBuf = (char *)PR_Malloc(count + 1);
  if (!newBuf)
    return NS_ERROR_FAILURE;

  PRUint32 numWritten = 0;
  rv = inStr->Read(newBuf, count, &numWritten);
  if (rv == NS_BASE_STREAM_WOULD_BLOCK)
    rv = NS_OK;
  newBuf[numWritten] = '\0';
  if (NS_SUCCEEDED(rv) && numWritten > 0)
  {
    // Create unicode decoder.
    if (!mUnicodeDecoder)
    {
      nsCOMPtr<nsICharsetConverterManager> ccm =
               do_GetService(NS_CHARSETCONVERTERMANAGER_CONTRACTID, &rv);
      if (NS_SUCCEEDED(rv))
      {
        rv = ccm->GetUnicodeDecoderRaw("UTF-8",
                                       getter_AddRefs(mUnicodeDecoder));
      }
    }

    if (NS_SUCCEEDED(rv))
    {
      PRInt32 unicharLength;
      PRInt32 inputLength = (PRInt32) numWritten;
      rv = mUnicodeDecoder->GetMaxLength(newBuf, numWritten, &unicharLength);
      if (NS_SUCCEEDED(rv))
      {
        // Use this local buffer if possible.
        const PRInt32 kLocalBufSize = 4096;
        PRUnichar localBuf[kLocalBufSize];
        PRUnichar *unichars = localBuf;

        if (unicharLength > kLocalBufSize)
        {
          // Otherwise, use the buffer of the class.
          if (!mUnicodeConversionBuffer ||
              unicharLength > mUnicodeBufferCharacterLength)
          {
            if (mUnicodeConversionBuffer)
              nsMemory::Free(mUnicodeConversionBuffer);
            mUnicodeConversionBuffer = (PRUnichar *) nsMemory::Alloc(unicharLength * sizeof(PRUnichar));
            if (!mUnicodeConversionBuffer)
            {
              mUnicodeBufferCharacterLength = 0;
              PR_Free(newBuf);
              return NS_ERROR_OUT_OF_MEMORY;
            }
            mUnicodeBufferCharacterLength = unicharLength;
          }
          unichars = mUnicodeConversionBuffer;
        }

        PRInt32 consumedInputLength = 0;
        PRInt32 originalInputLength = inputLength;
        char *inputBuffer = newBuf;
        PRInt32 convertedOutputLength = 0;
        PRInt32 outputBufferLength = unicharLength;
        PRUnichar *originalOutputBuffer = unichars;
        do
        {
          rv = mUnicodeDecoder->Convert(inputBuffer, &inputLength, unichars, &unicharLength);
          if (NS_SUCCEEDED(rv))
          {
            convertedOutputLength += unicharLength;
            break;
          }

          // if we failed, we consume one byte, replace it with a question mark
          // and try the conversion again.
          unichars += unicharLength;
          *unichars = (PRUnichar)'?';
          unichars++;
          unicharLength++;

          mUnicodeDecoder->Reset();

          inputBuffer += ++inputLength;
          consumedInputLength += inputLength;
          inputLength = originalInputLength - consumedInputLength;  // update input length to convert
          convertedOutputLength += unicharLength;
          unicharLength = outputBufferLength - unicharLength;       // update output length

        } while (NS_FAILED(rv) &&
                 (originalInputLength > consumedInputLength) &&
                 (outputBufferLength > convertedOutputLength));

        if (convertedOutputLength > 0)
          mMsgBody.Append(originalOutputBuffer, convertedOutputLength);
      }
    }
  }

  PR_FREEIF(newBuf);
  return rv;
}

nsresult
QuotingOutputStreamListener::SetComposeObj(nsIMsgCompose *obj)
{
  mWeakComposeObj = do_GetWeakReference(obj);
  return NS_OK;
}

nsresult
QuotingOutputStreamListener::SetMimeHeaders(nsIMimeHeaders * headers)
{
  mHeaders = headers;
  return NS_OK;
}

NS_IMETHODIMP
QuotingOutputStreamListener::InsertToCompose(nsIEditor *aEditor,
                                             PRBool aHTMLEditor)
{
  // First, get the nsIEditor interface for future use
  nsCOMPtr<nsIDOMNode> nodeInserted;

  TranslateLineEnding(mMsgBody);

  // Now, insert it into the editor...
  if (aEditor)
    aEditor->EnableUndo(PR_TRUE);

  nsCOMPtr<nsIMsgCompose> compose = do_QueryReferent(mWeakComposeObj);
  if (!mMsgBody.IsEmpty() && compose)
  {
    compose->SetInsertingQuotedContent(PR_TRUE);
    if (!mCitePrefix.IsEmpty())
    {
      if (!aHTMLEditor)
        mCitePrefix.AppendLiteral("\n");
      nsCOMPtr<nsIPlaintextEditor> textEditor (do_QueryInterface(aEditor));
      if (textEditor)
        textEditor->InsertText(mCitePrefix);
    }

    nsCOMPtr<nsIEditorMailSupport> mailEditor (do_QueryInterface(aEditor));
    if (mailEditor)
    {
      if (aHTMLEditor)
        mailEditor->InsertAsCitedQuotation(mMsgBody, EmptyString(), PR_TRUE,
                                           getter_AddRefs(nodeInserted));
      else
        mailEditor->InsertAsQuotation(mMsgBody, getter_AddRefs(nodeInserted));
    }
    compose->SetInsertingQuotedContent(PR_FALSE);
  }

  if (aEditor)
  {
    nsCOMPtr<nsIPlaintextEditor> textEditor = do_QueryInterface(aEditor);
    if (textEditor)
    {
      nsCOMPtr<nsISelection> selection;
      nsCOMPtr<nsIDOMNode>   parent;
      PRInt32                offset;
      nsresult               rv;

      // get parent and offset of mailcite
      rv = GetNodeLocation(nodeInserted, address_of(parent), &offset);
      NS_ENSURE_SUCCESS(rv, rv);

      // get selection
      aEditor->GetSelection(getter_AddRefs(selection));
      if (selection)
      {
        // place selection after mailcite
        selection->Collapse(parent, offset+1);
        // insert a break at current selection
        textEditor->InsertLineBreak();
        selection->Collapse(parent, offset+1);
      }
      nsCOMPtr<nsISelectionController> selCon;
      aEditor->GetSelectionController(getter_AddRefs(selCon));

      if (selCon)
        // After ScrollSelectionIntoView(), the pending notifications might be
        // flushed and PresShell/PresContext/Frames may be dead. See bug 418470.
        selCon->ScrollSelectionIntoView(
                  nsISelectionController::SELECTION_NORMAL,
                  nsISelectionController::SELECTION_ANCHOR_REGION,
                  PR_TRUE);
    }
  }

  return NS_OK;
}

NS_IMPL_ISUPPORTS3(QuotingOutputStreamListener,
                   nsIMsgQuotingOutputStreamListener,
                   nsIRequestObserver,
                   nsIStreamListener)

////////////////////////////////////////////////////////////////////////////////////
// END OF QUOTING LISTENER
////////////////////////////////////////////////////////////////////////////////////

/* attribute MSG_ComposeType type; */
NS_IMETHODIMP nsMsgCompose::SetType(MSG_ComposeType aType)
{

  mType = aType;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::GetType(MSG_ComposeType *aType)
{
  NS_ENSURE_ARG_POINTER(aType);

  *aType = mType;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgCompose::QuoteMessage(const char *msgURI)
{
  nsresult    rv;

  mQuotingToFollow = PR_FALSE;

  // Create a mime parser (nsIStreamConverter)!
  mQuote = do_CreateInstance(NS_MSGQUOTE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr <nsIMsgDBHdr> msgHdr;
  rv = GetMsgDBHdrFromURI(msgURI, getter_AddRefs(msgHdr));

  // Create the consumer output stream.. this will receive all the HTML from libmime
  mQuoteStreamListener =
    new QuotingOutputStreamListener(msgURI, msgHdr, PR_FALSE, !mHtmlToQuote.IsEmpty(), m_identity,
                                    m_compFields->GetCharacterSet(), mCharsetOverride, PR_FALSE,
                                    mHtmlToQuote);

  if (!mQuoteStreamListener)
  {
#ifdef NS_DEBUG
    printf("Failed to create mQuoteStreamListener\n");
#endif
    return NS_ERROR_FAILURE;
  }
  NS_ADDREF(mQuoteStreamListener);

  mQuoteStreamListener->SetComposeObj(this);

  rv = mQuote->QuoteMessage(msgURI, PR_FALSE, mQuoteStreamListener,
                            mCharsetOverride ? m_compFields->GetCharacterSet() : "", PR_FALSE);
  return rv;
}

nsresult
nsMsgCompose::QuoteOriginalMessage(const char *originalMsgURI, PRInt32 what) // New template
{
  nsresult    rv;

  mQuotingToFollow = PR_FALSE;

  // Create a mime parser (nsIStreamConverter)!
  mQuote = do_CreateInstance(NS_MSGQUOTE_CONTRACTID, &rv);
  if (NS_FAILED(rv) || !mQuote)
    return NS_ERROR_FAILURE;

  PRBool bAutoQuote = PR_TRUE;
  m_identity->GetAutoQuote(&bAutoQuote);

  nsCOMPtr <nsIMsgDBHdr> originalMsgHdr = mOrigMsgHdr;
  if (!originalMsgHdr)
  {
    rv = GetMsgDBHdrFromURI(originalMsgURI, getter_AddRefs(originalMsgHdr));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Create the consumer output stream.. this will receive all the HTML from libmime
  mQuoteStreamListener =
    new QuotingOutputStreamListener(originalMsgURI, originalMsgHdr, what != 1,
                                    !bAutoQuote || !mHtmlToQuote.IsEmpty(), m_identity,
                                    mQuoteCharset.get(), mCharsetOverride, PR_TRUE, mHtmlToQuote);

  if (!mQuoteStreamListener)
  {
#ifdef NS_DEBUG
    printf("Failed to create mQuoteStreamListener\n");
#endif
    return NS_ERROR_FAILURE;
  }
  NS_ADDREF(mQuoteStreamListener);

  mQuoteStreamListener->SetComposeObj(this);

  rv = mQuote->QuoteMessage(originalMsgURI, what != 1, mQuoteStreamListener,
                            mCharsetOverride ? mQuoteCharset.get() : "", !bAutoQuote);
  return rv;
}

//CleanUpRecipient will remove un-necessary "<>" when a recipient as an address without name
void nsMsgCompose::CleanUpRecipients(nsString& recipients)
{
  PRUint16 i;
  PRBool startANewRecipient = PR_TRUE;
  PRBool removeBracket = PR_FALSE;
  nsAutoString newRecipient;
  PRUnichar aChar;

  for (i = 0; i < recipients.Length(); i ++)
  {
    aChar = recipients[i];
    switch (aChar)
    {
      case '<'  :
        if (startANewRecipient)
          removeBracket = PR_TRUE;
        else
          newRecipient += aChar;
        startANewRecipient = PR_FALSE;
        break;

      case '>'  :
        if (removeBracket)
          removeBracket = PR_FALSE;
        else
          newRecipient += aChar;
        break;

      case ' '  :
        newRecipient += aChar;
        break;

      case ','  :
        newRecipient += aChar;
        startANewRecipient = PR_TRUE;
        removeBracket = PR_FALSE;
        break;

      default   :
        newRecipient += aChar;
        startANewRecipient = PR_FALSE;
        break;
    }
  }
  recipients = newRecipient;
}

NS_IMETHODIMP nsMsgCompose::RememberQueuedDisposition()
{
  // need to find the msg hdr in the saved folder and then set a property on
  // the header that we then look at when we actually send the message.

  const char *dispositionSetting = nsnull;

  if (mType == nsIMsgCompType::Reply ||
      mType == nsIMsgCompType::ReplyAll ||
      mType == nsIMsgCompType::ReplyToList ||
      mType == nsIMsgCompType::ReplyToGroup ||
      mType == nsIMsgCompType::ReplyToSender ||
      mType == nsIMsgCompType::ReplyToSenderAndGroup)
    dispositionSetting = "replied";
  else if (mType == nsIMsgCompType::ForwardAsAttachment ||
           mType == nsIMsgCompType::ForwardInline)
    dispositionSetting = "forwarded";

  nsMsgKey msgKey;
  if (mMsgSend)
  {
    mMsgSend->GetMessageKey(&msgKey);
    nsCAutoString msgUri(m_folderName);
    nsCString identityKey;

    m_identity->GetKey(identityKey);

    PRInt32 insertIndex = StringBeginsWith(msgUri, NS_LITERAL_CSTRING("mailbox")) ? 7 : 4;
    msgUri.Insert("-message", insertIndex); // "mailbox/imap: -> "mailbox/imap-message:"
    msgUri.Append('#');
    msgUri.AppendInt(msgKey);
    nsCOMPtr <nsIMsgDBHdr> msgHdr;
    nsresult rv = GetMsgDBHdrFromURI(msgUri.get(), getter_AddRefs(msgHdr));
    NS_ENSURE_SUCCESS(rv, rv);
    // If we did't find the msg hdr, and it's an IMAP message,
    // we must not have downloaded the header. So we're going to set some 
    // pending attributes on the header for the queued disposition, so that
    // we can associate them with the header, once we've downloaded it from
    // the imap server.
    if (!msgHdr && insertIndex == 4)
    {
      nsCOMPtr<nsIRDFService> rdfService (do_GetService("@mozilla.org/rdf/rdf-service;1", &rv));
      NS_ENSURE_SUCCESS(rv, rv);

      nsCOMPtr <nsIRDFResource> resource;
      rv = rdfService->GetResource(m_folderName, getter_AddRefs(resource));
      NS_ENSURE_SUCCESS(rv, rv);

      nsCOMPtr <nsIMsgFolder> msgFolder(do_QueryInterface(resource));
      if (msgFolder)
      {
        nsCOMPtr <nsIMsgDatabase> msgDB;
        msgFolder->GetMsgDatabase(getter_AddRefs(msgDB));
        if (msgDB)
        {
          msgDB->CreateNewHdr(msgKey, getter_AddRefs(msgHdr));
          if (msgHdr)
          {
            nsCString messageId;
            mMsgSend->GetMessageId(messageId);
            msgHdr->SetMessageId(messageId.get());
            if (!mOriginalMsgURI.IsEmpty())
            {
              msgDB->SetAttributeOnPendingHdr(msgHdr, ORIG_URI_PROPERTY, mOriginalMsgURI.get());
              if (dispositionSetting)
                msgDB->SetAttributeOnPendingHdr(msgHdr, QUEUED_DISPOSITION_PROPERTY, dispositionSetting);
            }
            msgDB->SetAttributeOnPendingHdr(msgHdr, HEADER_X_MOZILLA_IDENTITY_KEY, identityKey.get());
            msgDB->RemoveHeaderMdbRow(msgHdr);
          }
        }
      }
    }
    else if (msgHdr)
    {
      if (!mOriginalMsgURI.IsEmpty())
      {
        msgHdr->SetStringProperty(ORIG_URI_PROPERTY, mOriginalMsgURI.get());
        if (dispositionSetting)
          msgHdr->SetStringProperty(QUEUED_DISPOSITION_PROPERTY, dispositionSetting);
      }
      msgHdr->SetStringProperty(HEADER_X_MOZILLA_IDENTITY_KEY, identityKey.get());
    }
  }
  return NS_OK;
}

nsresult nsMsgCompose::ProcessReplyFlags()
{
  nsresult rv;
  // check to see if we were doing a reply or a forward, if we were, set the answered field flag on the message folder
  // for this URI.
  if (mType == nsIMsgCompType::Reply ||
      mType == nsIMsgCompType::ReplyAll ||
      mType == nsIMsgCompType::ReplyToList ||
      mType == nsIMsgCompType::ReplyToGroup ||
      mType == nsIMsgCompType::ReplyToSender ||
      mType == nsIMsgCompType::ReplyToSenderAndGroup ||
      mType == nsIMsgCompType::ForwardAsAttachment ||
      mType == nsIMsgCompType::ForwardInline ||
      mDraftDisposition != nsIMsgFolder::nsMsgDispositionState_None)
  {
    if (!mOriginalMsgURI.IsEmpty())
    {
      nsCString msgUri (mOriginalMsgURI);
      char *newStr = msgUri.BeginWriting();
      char *uri;
      while (nsnull != (uri = NS_strtok(",", &newStr)))
      {
        nsCOMPtr <nsIMsgDBHdr> msgHdr;
        rv = GetMsgDBHdrFromURI(uri, getter_AddRefs(msgHdr));
        NS_ENSURE_SUCCESS(rv,rv);
        if (msgHdr)
        {
          // get the folder for the message resource
          nsCOMPtr<nsIMsgFolder> msgFolder;
          msgHdr->GetFolder(getter_AddRefs(msgFolder));
          if (msgFolder)
          {
            // assume reply. If a draft with disposition, use that, otherwise,
            // check if it's a forward.
            nsMsgDispositionState dispositionSetting = nsIMsgFolder::nsMsgDispositionState_Replied;
            if (mDraftDisposition != nsIMsgFolder::nsMsgDispositionState_None)
              dispositionSetting = mDraftDisposition;
            else if (mType == nsIMsgCompType::ForwardAsAttachment ||
                mType == nsIMsgCompType::ForwardInline)
              dispositionSetting = nsIMsgFolder::nsMsgDispositionState_Forwarded;

            msgFolder->AddMessageDispositionState(msgHdr, dispositionSetting);
            if (mType != nsIMsgCompType::ForwardAsAttachment)
              break;         // just safeguard
          }
        }
      }
    }
  }

  return NS_OK;
}
NS_IMETHODIMP nsMsgCompose::OnStartSending(const char *aMsgID, PRUint32 aMsgSize)
{
  nsTObserverArray<nsCOMPtr<nsIMsgSendListener> >::ForwardIterator iter(mExternalSendListeners);
  nsCOMPtr<nsIMsgSendListener> externalSendListener;

  while (iter.HasMore()) 
  {
    externalSendListener = iter.GetNext();
    externalSendListener->OnStartSending(aMsgID, aMsgSize);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::OnProgress(const char *aMsgID, PRUint32 aProgress, PRUint32 aProgressMax)
{
  nsTObserverArray<nsCOMPtr<nsIMsgSendListener> >::ForwardIterator iter(mExternalSendListeners);
  nsCOMPtr<nsIMsgSendListener> externalSendListener;

  while (iter.HasMore())
  {
    externalSendListener = iter.GetNext();
    externalSendListener->OnProgress(aMsgID, aProgress, aProgressMax);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::OnStatus(const char *aMsgID, const PRUnichar *aMsg)
{
  nsTObserverArray<nsCOMPtr<nsIMsgSendListener> >::ForwardIterator iter(mExternalSendListeners);
  nsCOMPtr<nsIMsgSendListener> externalSendListener;

  while (iter.HasMore())
  {
    externalSendListener = iter.GetNext();
    externalSendListener->OnStatus(aMsgID, aMsg);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::OnStopSending(const char *aMsgID, nsresult aStatus, const PRUnichar *aMsg,
                                      nsIFile *returnFile)
{
  nsTObserverArray<nsCOMPtr<nsIMsgSendListener> >::ForwardIterator iter(mExternalSendListeners);
  nsCOMPtr<nsIMsgSendListener> externalSendListener;

  while (iter.HasMore())
  {
    externalSendListener = iter.GetNext();
    externalSendListener->OnStopSending(aMsgID, aStatus, aMsg, returnFile);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::OnSendNotPerformed(const char *aMsgID, nsresult aStatus)
{
  nsTObserverArray<nsCOMPtr<nsIMsgSendListener> >::ForwardIterator iter(mExternalSendListeners);
  nsCOMPtr<nsIMsgSendListener> externalSendListener;

  while (iter.HasMore())
  {
    externalSendListener = iter.GetNext();
    externalSendListener->OnSendNotPerformed(aMsgID, aStatus);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::OnGetDraftFolderURI(const char *aFolderURI)
{
  m_folderName = aFolderURI;
  nsTObserverArray<nsCOMPtr<nsIMsgSendListener> >::ForwardIterator iter(mExternalSendListeners);
  nsCOMPtr<nsIMsgSendListener> externalSendListener;

  while (iter.HasMore())
  {
    externalSendListener = iter.GetNext();
    externalSendListener->OnGetDraftFolderURI(aFolderURI);
  }
  return NS_OK;
}

////////////////////////////////////////////////////////////////////////////////////
// This is the listener class for both the send operation and the copy operation.
// We have to create this class to listen for message send completion and deal with
// failures in both send and copy operations
////////////////////////////////////////////////////////////////////////////////////
NS_IMPL_ADDREF(nsMsgComposeSendListener)
NS_IMPL_RELEASE(nsMsgComposeSendListener)

/*
NS_IMPL_QUERY_INTERFACE4(nsMsgComposeSendListener,
                         nsIMsgComposeSendListener,
                         nsIMsgSendListener,
                         nsIMsgCopyServiceListener,
                         nsIWebProgressListener)
*/
NS_INTERFACE_MAP_BEGIN(nsMsgComposeSendListener)
  NS_INTERFACE_MAP_ENTRY_AMBIGUOUS(nsISupports, nsIMsgComposeSendListener)
  NS_INTERFACE_MAP_ENTRY(nsIMsgComposeSendListener)
  NS_INTERFACE_MAP_ENTRY(nsIMsgSendListener)
  NS_INTERFACE_MAP_ENTRY(nsIMsgCopyServiceListener)
  NS_INTERFACE_MAP_ENTRY(nsIWebProgressListener)
NS_INTERFACE_MAP_END


nsMsgComposeSendListener::nsMsgComposeSendListener(void)
{
#if defined(DEBUG_ducarroz)
  printf("CREATE nsMsgComposeSendListener: %x\n", this);
#endif
  mDeliverMode = 0;
}

nsMsgComposeSendListener::~nsMsgComposeSendListener(void)
{
#if defined(DEBUG_ducarroz)
  printf("DISPOSE nsMsgComposeSendListener: %x\n", this);
#endif
}

NS_IMETHODIMP nsMsgComposeSendListener::SetMsgCompose(nsIMsgCompose *obj)
{
  mWeakComposeObj = do_GetWeakReference(obj);
  return NS_OK;
}

NS_IMETHODIMP nsMsgComposeSendListener::SetDeliverMode(MSG_DeliverMode deliverMode)
{
  mDeliverMode = deliverMode;
  return NS_OK;
}

nsresult
nsMsgComposeSendListener::OnStartSending(const char *aMsgID, PRUint32 aMsgSize)
{
  nsresult rv;
  nsCOMPtr<nsIMsgSendListener> composeSendListener = do_QueryReferent(mWeakComposeObj, &rv);
  if (NS_SUCCEEDED(rv) && composeSendListener)
    composeSendListener->OnStartSending(aMsgID, aMsgSize);
  
  return NS_OK;
}

nsresult
nsMsgComposeSendListener::OnProgress(const char *aMsgID, PRUint32 aProgress, PRUint32 aProgressMax)
{
  nsresult rv;
  nsCOMPtr<nsIMsgSendListener> composeSendListener = do_QueryReferent(mWeakComposeObj, &rv);
  if (NS_SUCCEEDED(rv) && composeSendListener)
    composeSendListener->OnProgress(aMsgID, aProgress, aProgressMax);
  return NS_OK;
}

nsresult
nsMsgComposeSendListener::OnStatus(const char *aMsgID, const PRUnichar *aMsg)
{
  nsresult rv;
  nsCOMPtr<nsIMsgSendListener> composeSendListener = do_QueryReferent(mWeakComposeObj, &rv);
  if (NS_SUCCEEDED(rv) && composeSendListener)
    composeSendListener->OnStatus(aMsgID, aMsg);
  return NS_OK;
}

nsresult nsMsgComposeSendListener::OnSendNotPerformed(const char *aMsgID, nsresult aStatus)
{
 // since OnSendNotPerformed is called in the case where the user aborts the operation
 // by closing the compose window, we need not do the stuff required
 // for closing the windows. However we would need to do the other operations as below.

  nsresult rv = NS_OK;
  nsCOMPtr<nsIMsgCompose> msgCompose = do_QueryReferent(mWeakComposeObj, &rv);
  if (msgCompose)
    msgCompose->NotifyStateListeners(nsIMsgComposeNotificationType::ComposeProcessDone, aStatus);

  nsCOMPtr<nsIMsgSendListener> composeSendListener = do_QueryReferent(mWeakComposeObj, &rv);
  if (NS_SUCCEEDED(rv) && composeSendListener)
    composeSendListener->OnSendNotPerformed(aMsgID, aStatus);

  return rv;
}

nsresult nsMsgComposeSendListener::OnStopSending(const char *aMsgID, nsresult aStatus, 
                                                 const PRUnichar *aMsg, nsIFile *returnFile)
{
  nsresult rv = NS_OK;

  nsCOMPtr<nsIMsgCompose> msgCompose = do_QueryReferent(mWeakComposeObj, &rv);
  if (msgCompose)
  {
    nsCOMPtr<nsIMsgProgress> progress;
    msgCompose->GetProgress(getter_AddRefs(progress));

    if (NS_SUCCEEDED(aStatus))
    {
#ifdef NS_DEBUG
      printf("nsMsgComposeSendListener: Success on the message send operation!\n");
#endif
      nsCOMPtr<nsIMsgCompFields> compFields;
      msgCompose->GetCompFields(getter_AddRefs(compFields));

      // only process the reply flags if we successfully sent the message
      msgCompose->ProcessReplyFlags();
      
      // See if there is a composer window
      PRBool hasDomWindow = PR_TRUE;
      nsCOMPtr<nsIDOMWindowInternal> domWindow;
      rv = msgCompose->GetDomWindow(getter_AddRefs(domWindow));
      if (NS_FAILED(rv) || !domWindow)
        hasDomWindow = PR_FALSE;

      // Close the window ONLY if we are not going to do a save operation
      nsAutoString fieldsFCC;
      if (NS_SUCCEEDED(compFields->GetFcc(fieldsFCC)))
      {
        if (!fieldsFCC.IsEmpty())
        {
          if (fieldsFCC.LowerCaseEqualsLiteral("nocopy://"))
          {
            msgCompose->NotifyStateListeners(nsIMsgComposeNotificationType::ComposeProcessDone, NS_OK);
            if (progress)
            {
              progress->UnregisterListener(this);
              progress->CloseProgressDialog(PR_FALSE);
            }
            if (hasDomWindow)
              msgCompose->CloseWindow(PR_TRUE);
          }
        }
      }
      else
      {
        msgCompose->NotifyStateListeners(nsIMsgComposeNotificationType::ComposeProcessDone, NS_OK);
        if (progress)
        {
          progress->UnregisterListener(this);
          progress->CloseProgressDialog(PR_FALSE);
        }
        if (hasDomWindow)
          msgCompose->CloseWindow(PR_TRUE);  // if we fail on the simple GetFcc call, close the window to be safe and avoid
                                              // windows hanging around to prevent the app from exiting.
      }

      // Remove the current draft msg when sending draft is done.
      PRBool deleteDraft;
      msgCompose->GetDeleteDraft(&deleteDraft);
      if (deleteDraft)
        RemoveCurrentDraftMessage(msgCompose, PR_FALSE);
    }
    else
    {
#ifdef NS_DEBUG
      printf("nsMsgComposeSendListener: the message send operation failed!\n");
#endif
      msgCompose->NotifyStateListeners(nsIMsgComposeNotificationType::ComposeProcessDone, aStatus);
      if (progress)
      {
        progress->CloseProgressDialog(PR_TRUE);
        progress->UnregisterListener(this);
      }
    }

  }

  nsCOMPtr<nsIMsgSendListener> composeSendListener = do_QueryReferent(mWeakComposeObj, &rv);
  if (NS_SUCCEEDED(rv) && composeSendListener)
    composeSendListener->OnStopSending(aMsgID, aStatus, aMsg, returnFile);

  return rv;
}

nsresult
nsMsgComposeSendListener::OnGetDraftFolderURI(const char *aFolderURI)
{
  nsresult rv;
  nsCOMPtr<nsIMsgSendListener> composeSendListener = do_QueryReferent(mWeakComposeObj, &rv);
  if (NS_SUCCEEDED(rv) && composeSendListener)
    composeSendListener->OnGetDraftFolderURI(aFolderURI);

  return NS_OK;
}


nsresult
nsMsgComposeSendListener::OnStartCopy()
{
#ifdef NS_DEBUG
  printf("nsMsgComposeSendListener::OnStartCopy()\n");
#endif

  return NS_OK;
}

nsresult
nsMsgComposeSendListener::OnProgress(PRUint32 aProgress, PRUint32 aProgressMax)
{
#ifdef NS_DEBUG
  printf("nsMsgComposeSendListener::OnProgress() - COPY\n");
#endif
  return NS_OK;
}

nsresult
nsMsgComposeSendListener::OnStopCopy(nsresult aStatus)
{
  nsresult rv = NS_OK;
  nsCOMPtr<nsIMsgCompose> msgCompose = do_QueryReferent(mWeakComposeObj, &rv);
  if (msgCompose)
  {
    if (mDeliverMode == nsIMsgSend::nsMsgQueueForLater ||
        mDeliverMode == nsIMsgSend::nsMsgDeliverBackground ||
        mDeliverMode == nsIMsgSend::nsMsgSaveAsDraft)
    {
      msgCompose->RememberQueuedDisposition();
    }

    // Ok, if we are here, we are done with the send/copy operation so
    // we have to do something with the window....SHOW if failed, Close
    // if succeeded

    nsCOMPtr<nsIMsgProgress> progress;
    msgCompose->GetProgress(getter_AddRefs(progress));
    if (progress)
    {
      // Unregister ourself from msg compose progress
      progress->UnregisterListener(this);
      progress->CloseProgressDialog(NS_FAILED(aStatus));
    }

    msgCompose->NotifyStateListeners(nsIMsgComposeNotificationType::ComposeProcessDone, aStatus);

    if (NS_SUCCEEDED(aStatus))
    {
#ifdef NS_DEBUG
      printf("nsMsgComposeSendListener: Success on the message copy operation!\n");
#endif
      // We should only close the window if we are done. Things like templates
      // and drafts aren't done so their windows should stay open
      if (mDeliverMode == nsIMsgSend::nsMsgSaveAsDraft ||
          mDeliverMode == nsIMsgSend::nsMsgSaveAsTemplate)
      {
        msgCompose->NotifyStateListeners(nsIMsgComposeNotificationType::SaveInFolderDone, aStatus);
        // Remove the current draft msg when saving as draft/template is done.
        msgCompose->SetDeleteDraft(PR_TRUE);
        RemoveCurrentDraftMessage(msgCompose, PR_TRUE);
      }
      else
      {
        // Remove (possible) draft if we're in send later mode
        if (mDeliverMode == nsIMsgSend::nsMsgQueueForLater ||
            mDeliverMode == nsIMsgSend::nsMsgDeliverBackground)
        {
          msgCompose->SetDeleteDraft(PR_TRUE);
          RemoveCurrentDraftMessage(msgCompose, PR_TRUE);
        }
        msgCompose->CloseWindow(PR_TRUE);
      }
    }
#ifdef NS_DEBUG
    else
      printf("nsMsgComposeSendListener: the message copy operation failed!\n");
#endif
  }

  return rv;
}

nsresult
nsMsgComposeSendListener::GetMsgFolder(nsIMsgCompose *compObj, nsIMsgFolder **msgFolder)
{
  nsresult rv;
  nsCOMPtr<nsIMsgFolder> aMsgFolder;
  nsCString folderUri;

  rv = compObj->GetSavedFolderURI(getter_Copies(folderUri));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIRDFService> rdfService (do_GetService("@mozilla.org/rdf/rdf-service;1", &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr <nsIRDFResource> resource;
  rv = rdfService->GetResource(folderUri, getter_AddRefs(resource));
  NS_ENSURE_SUCCESS(rv, rv);

  aMsgFolder = do_QueryInterface(resource, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  NS_IF_ADDREF(*msgFolder = aMsgFolder);
  return rv;
}

nsresult
nsMsgComposeSendListener::RemoveCurrentDraftMessage(nsIMsgCompose *compObj, PRBool calledByCopy)
{
  nsresult rv;
  nsCOMPtr <nsIMsgCompFields> compFields = nsnull;

  rv = compObj->GetCompFields(getter_AddRefs(compFields));
  NS_ASSERTION(NS_SUCCEEDED(rv), "RemoveCurrentDraftMessage can't get compose fields");
  if (NS_FAILED(rv) || !compFields)
    return rv;

  nsCString curDraftIdURL;
  nsMsgKey newUid = 0;
  nsCString newDraftIdURL;
  nsCOMPtr<nsIMsgFolder> msgFolder;

  rv = compFields->GetDraftId(getter_Copies(curDraftIdURL));
  NS_ASSERTION(NS_SUCCEEDED(rv), "RemoveCurrentDraftMessage can't get draft id");

  // Skip if no draft id (probably a new draft msg).
  if (NS_SUCCEEDED(rv) && !curDraftIdURL.IsEmpty())
  {
    nsCOMPtr <nsIMsgDBHdr> msgDBHdr;
    rv = GetMsgDBHdrFromURI(curDraftIdURL.get(), getter_AddRefs(msgDBHdr));
    NS_ASSERTION(NS_SUCCEEDED(rv), "RemoveCurrentDraftMessage can't get msg header DB interface pointer.");
    if (NS_SUCCEEDED(rv) && msgDBHdr)
    {
      // get the folder for the message resource
      msgDBHdr->GetFolder(getter_AddRefs(msgFolder));
      NS_ASSERTION(NS_SUCCEEDED(rv), "RemoveCurrentDraftMessage can't get msg folder interface pointer.");
      if (NS_SUCCEEDED(rv) && msgFolder)
      {
        PRUint32 folderFlags;
        msgFolder->GetFlags(&folderFlags);
        // only do this if it's a drafts or templates folder.
        if (folderFlags & nsMsgFolderFlags::Drafts)
        {
          // build the msg arrary
          nsCOMPtr<nsIMutableArray> messageArray(do_CreateInstance(NS_ARRAY_CONTRACTID, &rv));
          NS_ASSERTION(NS_SUCCEEDED(rv), "RemoveCurrentDraftMessage can't allocate array.");

          //nsCOMPtr<nsISupports> msgSupport = do_QueryInterface(msgDBHdr, &rv);
          //NS_ASSERTION(NS_SUCCEEDED(rv), "RemoveCurrentDraftMessage can't get msg header interface pointer.");
          if (NS_SUCCEEDED(rv) && messageArray)
          {
            // ready to delete the msg
            rv = messageArray->AppendElement(msgDBHdr, PR_FALSE);
            NS_ASSERTION(NS_SUCCEEDED(rv), "RemoveCurrentDraftMessage can't append msg header to array.");
            if (NS_SUCCEEDED(rv))
              rv = msgFolder->DeleteMessages(messageArray, nsnull, PR_TRUE, PR_FALSE, nsnull, PR_FALSE /*allowUndo*/);
            NS_ASSERTION(NS_SUCCEEDED(rv), "RemoveCurrentDraftMessage can't delete message.");
          }
        }
      }
    }
    else
    {
      // If we get here we have the case where the draft folder
                  // is on the server and
      // it's not currently open (in thread pane), so draft
                  // msgs are saved to the server
      // but they're not in our local DB. In this case,
      // GetMsgDBHdrFromURI() will never
      // find the msg. If the draft folder is a local one
      // then we'll not get here because
      // the draft msgs are saved to the local folder and
      // are in local DB. Make sure the
      // msg folder is imap.  Even if we get here due to
      // DB errors (worst case), we should
      // still try to delete msg on the server because
      // that's where the master copy of the
      // msgs are stored, if draft folder is on the server.
      // For local case, since DB is bad
      // we can't do anything with it anyway so it'll be
      // noop in this case.
      rv = GetMsgFolder(compObj, getter_AddRefs(msgFolder));
      if (NS_SUCCEEDED(rv) && msgFolder)
      {
        nsCOMPtr <nsIMsgImapMailFolder> imapFolder = do_QueryInterface(msgFolder);
        NS_ASSERTION(imapFolder, "The draft folder MUST be an imap folder in order to mark the msg delete!");
        if (NS_SUCCEEDED(rv) && imapFolder)
        {
          const char * str = PL_strchr(curDraftIdURL.get(), '#');
          NS_ASSERTION(str, "Failed to get current draft id url");
          if (str)
          {
            nsCAutoString srcStr(str+1);
            PRInt32 err;
            nsMsgKey messageID = srcStr.ToInteger(&err, 10);
            if (messageID != nsMsgKey_None)
            {
              rv = imapFolder->StoreImapFlags(kImapMsgDeletedFlag, PR_TRUE,
                                              &messageID, 1, nsnull);
            }
          }
        }
      }
    }
  }

  // Now get the new uid so that next save will remove the right msg
  // regardless whether or not the exiting msg can be deleted.
  if (calledByCopy)
  {
    nsCOMPtr<nsIMsgFolder> savedToFolder;
    nsCOMPtr<nsIMsgSend> msgSend;
    rv = compObj->GetMessageSend(getter_AddRefs(msgSend));
    NS_ASSERTION(msgSend, "RemoveCurrentDraftMessage msgSend is null.");
    if (NS_FAILED(rv) || !msgSend)
      return rv;

    rv = msgSend->GetMessageKey(&newUid);
    NS_ENSURE_SUCCESS(rv, rv);

    // Make sure we have a folder interface pointer
    rv = GetMsgFolder(compObj, getter_AddRefs(savedToFolder));

    // Reset draft (uid) url with the new uid.
    if (savedToFolder && newUid != nsMsgKey_None)
    {
      PRUint32 folderFlags;
      savedToFolder->GetFlags(&folderFlags);
      if (folderFlags & nsMsgFolderFlags::Drafts)
      {
        rv = savedToFolder->GenerateMessageURI(newUid, newDraftIdURL);
        NS_ENSURE_SUCCESS(rv, rv);
        compFields->SetDraftId(newDraftIdURL.get());
      }
    }
  }
  return rv;
}

nsresult
nsMsgComposeSendListener::SetMessageKey(PRUint32 aMessageKey)
{
  return NS_OK;
}

nsresult
nsMsgComposeSendListener::GetMessageId(nsACString& messageId)
{
  return NS_OK;
}

/* void onStateChange (in nsIWebProgress aWebProgress, in nsIRequest aRequest, in unsigned long aStateFlags, in nsresult aStatus); */
NS_IMETHODIMP nsMsgComposeSendListener::OnStateChange(nsIWebProgress *aWebProgress, nsIRequest *aRequest, PRUint32 aStateFlags, nsresult aStatus)
{
  if (aStateFlags == nsIWebProgressListener::STATE_STOP)
  {
    nsCOMPtr<nsIMsgCompose> msgCompose = do_QueryReferent(mWeakComposeObj);
    if (msgCompose)
    {
      nsCOMPtr<nsIMsgProgress> progress;
      msgCompose->GetProgress(getter_AddRefs(progress));

      // Time to stop any pending operation...
      if (progress)
      {
        // Unregister ourself from msg compose progress
        progress->UnregisterListener(this);

        PRBool bCanceled = PR_FALSE;
        progress->GetProcessCanceledByUser(&bCanceled);
        if (bCanceled)
        {
          nsresult rv;
          nsCOMPtr<nsIStringBundleService> bundleService(do_GetService("@mozilla.org/intl/stringbundle;1", &rv));
          NS_ENSURE_SUCCESS(rv, rv);
          nsCOMPtr<nsIStringBundle> bundle;
          rv = bundleService->CreateBundle("chrome://messenger/locale/messengercompose/composeMsgs.properties", getter_AddRefs(bundle));
          NS_ENSURE_SUCCESS(rv, rv);
          nsString msg;
          bundle->GetStringFromID(NS_ERROR_GET_CODE(NS_MSG_CANCELLING), getter_Copies(msg));
          progress->OnStatusChange(nsnull, nsnull, 0, msg.get());
        }
      }

      nsCOMPtr<nsIMsgSend> msgSend;
      msgCompose->GetMessageSend(getter_AddRefs(msgSend));
      if (msgSend)
        msgSend->Abort();
    }
  }
  return NS_OK;
}

/* void onProgressChange (in nsIWebProgress aWebProgress, in nsIRequest aRequest, in long aCurSelfProgress, in long aMaxSelfProgress, in long aCurTotalProgress, in long aMaxTotalProgress); */
NS_IMETHODIMP nsMsgComposeSendListener::OnProgressChange(nsIWebProgress *aWebProgress, nsIRequest *aRequest, PRInt32 aCurSelfProgress, PRInt32 aMaxSelfProgress, PRInt32 aCurTotalProgress, PRInt32 aMaxTotalProgress)
{
  /* Ignore this call */
  return NS_OK;
}

/* void onLocationChange (in nsIWebProgress aWebProgress, in nsIRequest aRequest, in nsIURI location); */
NS_IMETHODIMP nsMsgComposeSendListener::OnLocationChange(nsIWebProgress *aWebProgress, nsIRequest *aRequest, nsIURI *location)
{
  /* Ignore this call */
  return NS_OK;
}

/* void onStatusChange (in nsIWebProgress aWebProgress, in nsIRequest aRequest, in nsresult aStatus, in wstring aMessage); */
NS_IMETHODIMP nsMsgComposeSendListener::OnStatusChange(nsIWebProgress *aWebProgress, nsIRequest *aRequest, nsresult aStatus, const PRUnichar *aMessage)
{
  /* Ignore this call */
  return NS_OK;
}

/* void onSecurityChange (in nsIWebProgress aWebProgress, in nsIRequest aRequest, in unsigned long state); */
NS_IMETHODIMP nsMsgComposeSendListener::OnSecurityChange(nsIWebProgress *aWebProgress, nsIRequest *aRequest, PRUint32 state)
{
  /* Ignore this call */
  return NS_OK;
}

nsresult
nsMsgCompose::ConvertHTMLToText(nsILocalFile *aSigFile, nsString &aSigData)
{
  nsresult    rv;
  nsAutoString    origBuf;

  rv = LoadDataFromFile(aSigFile, origBuf);
  if (NS_FAILED(rv))
    return rv;

  ConvertBufToPlainText(origBuf,PR_FALSE);
  aSigData = origBuf;
  return NS_OK;
}

nsresult
nsMsgCompose::ConvertTextToHTML(nsILocalFile *aSigFile, nsString &aSigData)
{
  nsresult    rv;
  nsAutoString    origBuf;

  rv = LoadDataFromFile(aSigFile, origBuf);
  if (NS_FAILED(rv))
    return rv;

  // Ok, once we are here, we need to escape the data to make sure that
  // we don't do HTML stuff with plain text sigs.
  //
  PRUnichar *escaped = nsEscapeHTML2(origBuf.get());
  if (escaped)
  {
    aSigData.Append(escaped);
    NS_Free(escaped);
  }
  else
    aSigData.Append(origBuf);
  return NS_OK;
}

nsresult
nsMsgCompose::LoadDataFromFile(nsILocalFile *file, nsString &sigData,
                               PRBool aAllowUTF8, PRBool aAllowUTF16)
{
  PRInt32       readSize;
  PRUint32       nGot;
  char          *readBuf;
  char          *ptr;

  PRBool isDirectory = PR_FALSE;
  file->IsDirectory(&isDirectory);
  if (isDirectory) {
    NS_ERROR("file is a directory");
    return NS_MSG_ERROR_READING_FILE;
  }


  nsCOMPtr <nsIInputStream> inputFile;
  nsresult rv = NS_NewLocalFileInputStream(getter_AddRefs(inputFile), file);
  if (NS_FAILED(rv))
    return NS_MSG_ERROR_READING_FILE;

  PRInt64 fileSize;
  file->GetFileSize(&fileSize);
  readSize = (PRUint32) fileSize;


  ptr = readBuf = (char *)PR_Malloc(readSize + 1);  if (!readBuf)
    return NS_ERROR_OUT_OF_MEMORY;
  memset(readBuf, 0, readSize + 1);

  while (readSize) {
    inputFile->Read(ptr, readSize, &nGot);
    if (nGot) {
      readSize -= nGot;
      ptr += nGot;
    }
    else {
      readSize = 0;
    }
  }
  inputFile->Close();

  readSize = (PRUint32) fileSize;

  nsCAutoString sigEncoding(nsMsgI18NParseMetaCharset(file));
  PRBool removeSigCharset = !sigEncoding.IsEmpty() && m_composeHTML;

  if (sigEncoding.IsEmpty()) {
    if (aAllowUTF8 && IsUTF8(nsDependentCString(readBuf))) {
      sigEncoding.Assign("UTF-8");
    }
    else if (sigEncoding.IsEmpty() && aAllowUTF16 &&
             readSize % 2 == 0 && readSize >= 2 &&
             ((readBuf[0] == char(0xFE) && readBuf[1] == char(0xFF)) ||
              (readBuf[0] == char(0xFF) && readBuf[1] == char(0xFE)))) {
      sigEncoding.Assign("UTF-16");
    }
    else {
      //default to platform encoding for plain text files w/o meta charset
      nsCAutoString textFileCharset;
      nsMsgI18NTextFileCharset(textFileCharset);
      sigEncoding.Assign(textFileCharset);
    }
  }

  nsCAutoString readStr(readBuf, (PRInt32) fileSize);
  PR_FREEIF(readBuf);

  if (NS_FAILED(ConvertToUnicode(sigEncoding.get(), readStr, sigData)))
    CopyASCIItoUTF16(readStr, sigData);

  //remove sig meta charset to allow user charset override during composition
  if (removeSigCharset)
  {
    nsAutoString metaCharset(NS_LITERAL_STRING("charset="));
    AppendASCIItoUTF16(sigEncoding, metaCharset);
    // When we move to frozen linkage, this should become:
    // PRInt32 offset = sigData.Find(metaCharset, CaseInsensitiveCompare) ;
    //  if (offset >= 0)
    //    sigData.Cut(offset, metaCharset.Length());
    nsAString::const_iterator realstart, start, end;
    sigData.BeginReading(start);
    sigData.EndReading(end);
    realstart = start;
    if (FindInReadable(metaCharset, start, end,
                       nsCaseInsensitiveStringComparator()))
      sigData.Cut(Distance(realstart, start), Distance(start, end));
  }

  return NS_OK;
}

nsresult
nsMsgCompose::BuildQuotedMessageAndSignature(void)
{
  //
  // This should never happen...if it does, just bail out...
  //
  NS_ASSERTION(m_editor, "BuildQuotedMessageAndSignature but no editor!\n");
  if (!m_editor)
    return NS_ERROR_FAILURE;

  // We will fire off the quote operation and wait for it to
  // finish before we actually do anything with Ender...
  return QuoteOriginalMessage(mOriginalMsgURI.get(), mWhatHolder);
}

//
// This will process the signature file for the user. This method
// will always append the results to the mMsgBody member variable.
//
nsresult
nsMsgCompose::ProcessSignature(nsIMsgIdentity *identity, PRBool aQuoted, nsString *aMsgBody)
{
  nsresult    rv = NS_OK;

  // Now, we can get sort of fancy. This is the time we need to check
  // for all sorts of user defined stuff, like signatures and editor
  // types and the like!
  //
  //    user_pref(".....sig_file", "y:\\sig.html");
  //    user_pref(".....attach_signature", true);
  //    user_pref(".....htmlSigText", "unicode sig");
  //
  // Note: We will have intelligent signature behavior in that we
  // look at the signature file first...if the extension is .htm or
  // .html, we assume its HTML, otherwise, we assume it is plain text
  //
  // ...and that's not all! What we will also do now is look and see if
  // the file is an image file. If it is an image file, then we should
  // insert the correct HTML into the composer to have it work, but if we
  // are doing plain text compose, we should insert some sort of message
  // saying "Image Signature Omitted" or something (not done yet).
  //
  // If there's a sig pref, it will only be used if there is no sig file defined,
  // thus if attach_signature is checked, htmlSigText is ignored (bug 324495).
  // Plain-text signatures may or may not have a trailing line break (bug 428040).

  nsCAutoString sigNativePath;
  PRBool        attachFile = PR_FALSE;
  PRBool        useSigFile = PR_FALSE;
  PRBool        htmlSig = PR_FALSE;
  PRBool        imageSig = PR_FALSE;
  nsAutoString  sigData;
  nsAutoString sigOutput;
  PRInt32      reply_on_top = 0;
  PRBool       sig_bottom = PR_TRUE;

  nsCOMPtr<nsILocalFile> sigFile;
  if (identity)
  {
    if (!CheckIncludeSignaturePrefs(identity))
      return NS_OK;

    identity->GetReplyOnTop(&reply_on_top);
    identity->GetSigBottom(&sig_bottom);
    rv = identity->GetAttachSignature(&attachFile);
    if (NS_SUCCEEDED(rv) && attachFile)
    {
      rv = identity->GetSignature(getter_AddRefs(sigFile));
      if (NS_SUCCEEDED(rv) && sigFile) {
        rv = sigFile->GetNativePath(sigNativePath);
        if (NS_SUCCEEDED(rv) && !sigNativePath.IsEmpty()) {
          PRBool exists = PR_FALSE;
          sigFile->Exists(&exists);
          if (exists) {
            useSigFile = PR_TRUE; // ok, there's a signature file

            // Now, most importantly, we need to figure out what the content type is for
            // this signature...if we can't, we assume text
            nsCAutoString sigContentType;
            nsresult rv2; // don't want to clobber the other rv
            nsCOMPtr<nsIMIMEService> mimeFinder (do_GetService(NS_MIMESERVICE_CONTRACTID, &rv2));
            if (NS_SUCCEEDED(rv2)) {
              rv2 = mimeFinder->GetTypeFromFile(sigFile, sigContentType);
              if (NS_SUCCEEDED(rv2)) {
                if (StringBeginsWith(sigContentType, NS_LITERAL_CSTRING("image/"), nsCaseInsensitiveCStringComparator()))
                  imageSig = PR_TRUE;
                else if (sigContentType.Equals(TEXT_HTML, nsCaseInsensitiveCStringComparator()))
                  htmlSig = PR_TRUE;
              }
            }
          }
        }
      }
    }
  }

  // Unless signature to be attached from file, use preference value;
  // the htmlSigText value is always going to be treated as html if
  // the htmlSigFormat pref is true, otherwise it is considered text
  nsString prefSigText;
  if (identity && !attachFile)
    identity->GetHtmlSigText(prefSigText);
  // Now, if they didn't even want to use a signature, we should
  // just return nicely.
  //
  if ((!useSigFile  && prefSigText.IsEmpty()) || NS_FAILED(rv))
    return NS_OK;

  static const char      htmlBreak[] = "<BR>";
  static const char      dashes[] = "-- ";
  static const char      htmlsigopen[] = "<div class=\"moz-signature\">";
  static const char      htmlsigclose[] = "</div>";    /* XXX: Due to a bug in
                             4.x' HTML editor, it will not be able to
                             break this HTML sig, if quoted (for the user to
                             interleave a comment). */
  static const char      _preopen[] = "<pre class=\"moz-signature\" cols=%d>";
  char*                  preopen;
  static const char      preclose[] = "</pre>";

  PRInt32 wrapLength = 72; // setup default value in case GetWrapLength failed
  GetWrapLength(&wrapLength);
  preopen = PR_smprintf(_preopen, wrapLength);
  if (!preopen)
    return NS_ERROR_OUT_OF_MEMORY;

  if (imageSig)
  {
    // We have an image signature. If we're using the in HTML composer, we
    // should put in the appropriate HTML for inclusion, otherwise, do nothing.
    if (m_composeHTML)
    {
      sigOutput.AppendLiteral(htmlBreak);
      sigOutput.AppendLiteral(htmlsigopen);
      if (reply_on_top != 1 || sig_bottom || !aQuoted)
        sigOutput.AppendLiteral(dashes);
      sigOutput.AppendLiteral(htmlBreak);
      sigOutput.AppendLiteral("<img src=\"file:///");
           /* XXX pp This gives me 4 slashes on Unix, that's at least one to
              much. Better construct the URL with some service. */
      // this isn't right on windows - need to convert to url format...
      sigOutput.Append(NS_ConvertASCIItoUTF16(sigNativePath));
      sigOutput.AppendLiteral("\" border=0>");
      sigOutput.AppendLiteral(htmlsigclose);
    }
  }
  else if (useSigFile)
  {
    // is this a text sig with an HTML editor?
    if ( (m_composeHTML) && (!htmlSig) )
      ConvertTextToHTML(sigFile, sigData);
    // is this a HTML sig with a text window?
    else if ( (!m_composeHTML) && (htmlSig) )
      ConvertHTMLToText(sigFile, sigData);
    else // We have a match...
      LoadDataFromFile(sigFile, sigData);  // Get the data!
  }

  // if we have a prefSigText, append it to sigData.
  if (!prefSigText.IsEmpty())
  {
    // set htmlSig if the pref is supposed to contain HTML code, defaults to false
    rv = identity->GetHtmlSigFormat(&htmlSig);
    if (NS_FAILED(rv))
      htmlSig = PR_FALSE;

    if (!m_composeHTML)
    {
      if (htmlSig)
        ConvertBufToPlainText(prefSigText, PR_FALSE);
      sigData.Append(prefSigText);
    }
    else
    {
      if (!htmlSig)
      {
        PRUnichar* escaped = nsEscapeHTML2(prefSigText.get());
        if (escaped)
        {
          sigData.Append(escaped);
          NS_Free(escaped);
        }
        else
          sigData.Append(prefSigText);
      }
      else
        sigData.Append(prefSigText);
    }
  }

  // post-processing for plain-text signatures to ensure we end in CR, LF, or CRLF
  if (!htmlSig && !m_composeHTML)
  {
    PRInt32 sigLength = sigData.Length();
    if (sigLength > 0 && !(sigData.CharAt(sigLength - 1) == '\r')
                      && !(sigData.CharAt(sigLength - 1) == '\n'))
      sigData.AppendLiteral(CRLF);
  }

  // Now that sigData holds data...if any, append it to the body in a nice
  // looking manner
  if (!sigData.IsEmpty())
  {
    if (m_composeHTML)
    {
      sigOutput.AppendLiteral(htmlBreak);
      if (htmlSig)
        sigOutput.AppendLiteral(htmlsigopen);
      else
        sigOutput.AppendASCII(preopen);
    }
    else
      sigOutput.AppendLiteral(CRLF);

    if ((reply_on_top != 1 || sig_bottom || !aQuoted) &&
        sigData.Find("\r-- \r", PR_TRUE) < 0 &&
        sigData.Find("\n-- \n", PR_TRUE) < 0 &&
        sigData.Find("\n-- \r", PR_TRUE) < 0)
    {
      nsDependentSubstring firstFourChars(sigData, 0, 4);

      if (!(firstFourChars.EqualsLiteral("-- \n") ||
            firstFourChars.EqualsLiteral("-- \r")))
      {
        sigOutput.AppendLiteral(dashes);

        if (!m_composeHTML || !htmlSig)
          sigOutput.AppendLiteral(CRLF);
        else if (m_composeHTML)
          sigOutput.AppendLiteral(htmlBreak);
      }
    }

    // add CRLF before signature for plain-text mode if signature comes before quote
    if (!m_composeHTML && reply_on_top == 1 && !sig_bottom && aQuoted)
      sigOutput.AppendLiteral(CRLF);

    sigOutput.Append(sigData);

    if (m_composeHTML)
    {
      if (htmlSig)
        sigOutput.AppendLiteral(htmlsigclose);
      else
        sigOutput.AppendLiteral(preclose);
    }
  }

  aMsgBody->Append(sigOutput);
  PR_Free(preopen);
  return NS_OK;
}

nsresult
nsMsgCompose::BuildBodyMessageAndSignature()
{
  nsresult    rv = NS_OK;

  //
  // This should never happen...if it does, just bail out...
  //
  if (!m_editor)
    return NS_ERROR_FAILURE;

  //
  // Now, we have the body so we can just blast it into the
  // composition editor window.
  //
  nsAutoString   body;
  m_compFields->GetBody(body);

  /* Some time we want to add a signature and sometime we wont. Let's figure that now...*/
  PRBool addSignature;
  PRBool addDashes = PR_FALSE;
  switch (mType)
  {
    case nsIMsgCompType::ForwardInline :
      addSignature = PR_TRUE;
      addDashes = PR_TRUE;
      break;
    case nsIMsgCompType::New :
    case nsIMsgCompType::MailToUrl :    /* same as New */
    case nsIMsgCompType::Reply :        /* should not happen! but just in case */
    case nsIMsgCompType::ReplyAll :       /* should not happen! but just in case */
    case nsIMsgCompType::ReplyToList :    /* should not happen! but just in case */
    case nsIMsgCompType::ForwardAsAttachment :  /* should not happen! but just in case */
    case nsIMsgCompType::NewsPost :
    case nsIMsgCompType::ReplyToGroup :
    case nsIMsgCompType::ReplyToSender :
    case nsIMsgCompType::ReplyToSenderAndGroup :
      addSignature = PR_TRUE;
      break;

    case nsIMsgCompType::Draft :
    case nsIMsgCompType::Template :
    case nsIMsgCompType::Redirect :
      addSignature = PR_FALSE;
      break;

    default :
      addSignature = PR_FALSE;
      break;
  }

  nsAutoString tSignature;
  if (addSignature)
    ProcessSignature(m_identity, addDashes, &tSignature);

  // if type is new, but we have body, this is probably a mapi send, so we need to
  // replace '\n' with <br> so that the line breaks won't be lost by html.
  // if mailtourl, do the same.
  if (m_composeHTML && (mType == nsIMsgCompType::New || mType == nsIMsgCompType::MailToUrl))
    body.ReplaceSubstring(NS_LITERAL_STRING("\n").get(), NS_LITERAL_STRING("<br>").get());

  // Restore flowed text wrapping for Drafts/Templates.
  // Look for unquoted lines - if we have an unquoted line
  // that ends in a space, join this line with the next one
  // by removing the end of line char(s).
  PRInt32 wrapping_enabled = 0;
  GetWrapLength(&wrapping_enabled);
  if (!m_composeHTML && !addSignature && wrapping_enabled)
  {
    PRBool quote = PR_FALSE;
    for (PRUint32 i = 0; i < body.Length(); i ++)
    {
      if (i == 0 || body[i - 1] == '\n')  // newline
      {
        if (body[i] == '>')
        {
          quote = PR_TRUE;
          continue;
        }
        nsString s(Substring(body, i, 10));
        if (StringBeginsWith(s, NS_LITERAL_STRING("-- \r")) ||
            StringBeginsWith(s, NS_LITERAL_STRING("-- \n")))
        {
          i += 4;
          continue;
        }
        if (StringBeginsWith(s, NS_LITERAL_STRING("- -- \r")) ||
            StringBeginsWith(s, NS_LITERAL_STRING("- -- \n")))
        {
          i += 6;
          continue;
        }
      }
      if (body[i] == '\n' && i > 1)
      {
        if (quote)
        {
          quote = PR_FALSE;
          continue;   // skip quoted lines
        }
        PRUint32 j = i - 1;  // look backward for space
        if (body[j] == '\r')
          j --;
        if (body[j] == ' ')  // join this line with next one
          body.Cut(j + 1, i - j);  // remove CRLF
      }
    }
  }

  nsString empty;
  rv = ConvertAndLoadComposeWindow(empty, body, tSignature,
                                   PR_FALSE, m_composeHTML);

  return rv;
}

nsresult nsMsgCompose::NotifyStateListeners(PRInt32 aNotificationType, nsresult aResult)
{

  if (aNotificationType == nsIMsgComposeNotificationType::SaveInFolderDone)
    ResetUrisForEmbeddedObjects();

  nsTObserverArray<nsCOMPtr<nsIMsgComposeStateListener> >::ForwardIterator iter(mStateListeners);
  nsCOMPtr<nsIMsgComposeStateListener> thisListener;

  while (iter.HasMore())
  {
    thisListener = iter.GetNext();

    switch (aNotificationType)
    {
    case nsIMsgComposeNotificationType::ComposeFieldsReady:
      thisListener->NotifyComposeFieldsReady();
      break;

    case nsIMsgComposeNotificationType::ComposeProcessDone:
      thisListener->ComposeProcessDone(aResult);
      break;

    case nsIMsgComposeNotificationType::SaveInFolderDone:
      thisListener->SaveInFolderDone(m_folderName.get());
      break;

    case nsIMsgComposeNotificationType::ComposeBodyReady:
      thisListener->NotifyComposeBodyReady();
      break;

    default:
      NS_NOTREACHED("Unknown notification");
      break;
    }
  }

  return NS_OK;
}

nsresult nsMsgCompose::AttachmentPrettyName(const char* scheme, const char* charset, nsACString& _retval)
{
  nsresult rv;

  nsCOMPtr<nsIUTF8ConverterService> utf8Cvt =
    do_GetService(NS_UTF8CONVERTERSERVICE_CONTRACTID);
  NS_ENSURE_TRUE(utf8Cvt, NS_ERROR_UNEXPECTED);

  nsCAutoString utf8Scheme;

  if (PL_strncasestr(scheme, "file:", 5))
  {
    nsCOMPtr<nsIFile> file;
    rv = NS_GetFileFromURLSpec(nsDependentCString(scheme),
                               getter_AddRefs(file));
    NS_ENSURE_SUCCESS(rv, rv);
    nsAutoString leafName;
    rv = file->GetLeafName(leafName);
    NS_ENSURE_SUCCESS(rv, rv);
    CopyUTF16toUTF8(leafName, _retval);
    return rv;
  }

  // To work around a mysterious bug in VC++ 6.
  const char* cset = (!charset || !*charset) ? "UTF-8" : charset;
  rv = utf8Cvt->ConvertURISpecToUTF8(nsDependentCString(scheme),
                                     cset, utf8Scheme);

  if (NS_SUCCEEDED(rv)) {
    // Some ASCII characters still need to be escaped.
    NS_UnescapeURL(utf8Scheme.get(), utf8Scheme.Length(),
                   esc_SkipControl | esc_AlwaysCopy, _retval);
  } else {
    _retval.Assign(scheme);
  }
  if (PL_strncasestr(scheme, "http:", 5))
    _retval.Cut(0, 7);

  return NS_OK;
}

nsresult nsMsgCompose::GetABDirectories(const nsACString& aDirUri,
                                        nsIRDFService *aRDFService,
                                        nsCOMArray<nsIAbDirectory> &aDirArray)
{
  static PRBool collectedAddressbookFound;
  if (aDirUri.EqualsLiteral(kMDBDirectoryRoot))
    collectedAddressbookFound = PR_FALSE;

  nsresult rv;
  nsCOMPtr<nsIRDFResource> resource;
  rv = aRDFService->GetResource(aDirUri, getter_AddRefs(resource));
  NS_ENSURE_SUCCESS(rv, rv);

  // query interface
  nsCOMPtr<nsIAbDirectory> directory(do_QueryInterface(resource, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsISimpleEnumerator> subDirectories;
  if (NS_SUCCEEDED(directory->GetChildNodes(getter_AddRefs(subDirectories))) && subDirectories)
  {
    nsCOMPtr<nsISupports> item;
    PRBool hasMore;
    while (NS_SUCCEEDED(rv = subDirectories->HasMoreElements(&hasMore)) && hasMore)
    {
      if (NS_SUCCEEDED(subDirectories->GetNext(getter_AddRefs(item))))
      {
        directory = do_QueryInterface(item, &rv);
        if (NS_SUCCEEDED(rv))
        {
          PRBool bIsMailList;

          if (NS_SUCCEEDED(directory->GetIsMailList(&bIsMailList)) && bIsMailList)
            continue;

          nsCString uri;
          rv = directory->GetURI(uri);
          NS_ENSURE_SUCCESS(rv, rv);

          PRInt32 pos;
          if (uri.EqualsLiteral(kPersonalAddressbookUri))
            pos = 0;
          else
          {
            PRUint32 count = aDirArray.Count();

            if (uri.EqualsLiteral(kCollectedAddressbookUri))
            {
              collectedAddressbookFound = PR_TRUE;
              pos = count;
            }
            else
            {
              if (collectedAddressbookFound && count > 1)
                pos = count - 1;
              else
                pos = count;
            }
          }

          aDirArray.InsertObjectAt(directory, pos);
          rv = GetABDirectories(uri, aRDFService, aDirArray);
        }
      }
    }
  }
  return rv;
}

nsresult nsMsgCompose::BuildMailListArray(nsIAbDirectory* parentDir,
                                          nsISupportsArray* array)
{
  nsresult rv;

  nsCOMPtr<nsIAbDirectory> directory;
  nsCOMPtr<nsISimpleEnumerator> subDirectories;

  if (NS_SUCCEEDED(parentDir->GetChildNodes(getter_AddRefs(subDirectories))) && subDirectories)
  {
    nsCOMPtr<nsISupports> item;
    PRBool hasMore;
    while (NS_SUCCEEDED(rv = subDirectories->HasMoreElements(&hasMore)) && hasMore)
    {
      if (NS_SUCCEEDED(subDirectories->GetNext(getter_AddRefs(item))))
      {
        directory = do_QueryInterface(item, &rv);
        if (NS_SUCCEEDED(rv))
        {
          PRBool bIsMailList;

          if (NS_SUCCEEDED(directory->GetIsMailList(&bIsMailList)) && bIsMailList)
          {
            nsString listName;
            nsString listDescription;

            directory->GetDirName(listName);
            directory->GetDescription(listDescription);

            nsMsgMailList* mailList = new nsMsgMailList(listName,
                  listDescription, directory);
            if (!mailList)
              return NS_ERROR_OUT_OF_MEMORY;
            NS_ADDREF(mailList);

            rv = array->AppendElement(mailList);
            if (NS_FAILED(rv))
              return rv;

            NS_RELEASE(mailList);
          }
        }
      }
    }
  }
  return rv;
}


nsresult nsMsgCompose::GetMailListAddresses(nsString& name, nsISupportsArray* mailListArray, nsIMutableArray** addressesArray)
{
  nsresult rv;
  nsCOMPtr<nsIEnumerator> enumerator;

  rv = mailListArray->Enumerate(getter_AddRefs(enumerator));
  if (NS_SUCCEEDED(rv))
  {
    for (rv = enumerator->First(); NS_SUCCEEDED(rv); rv = enumerator->Next())
    {
      nsMsgMailList* mailList;
      rv = enumerator->CurrentItem((nsISupports**)&mailList);
      if (NS_SUCCEEDED(rv) && mailList)
      {
        if (name.Equals(mailList->mFullName, nsCaseInsensitiveStringComparator()))
        {
          if (!mailList->mDirectory)
            return NS_ERROR_FAILURE;

          mailList->mDirectory->GetAddressLists(addressesArray);
          NS_RELEASE(mailList);
          return NS_OK;
        }
        NS_RELEASE(mailList);
      }
    }
  }

  return NS_ERROR_FAILURE;
}


// 3 = To, Cc, Bcc
#define MAX_OF_RECIPIENT_ARRAY    3

NS_IMETHODIMP
nsMsgCompose::CheckAndPopulateRecipients(PRBool aPopulateMailList,
                                         PRBool aReturnNonHTMLRecipients,
                                         nsAString &aNonHTMLRecipients,
                                         PRUint32 *aResult)
{
  NS_ENSURE_ARG_POINTER(aResult);

  nsresult rv = NS_OK;

  aNonHTMLRecipients.Truncate();

  if (aResult)
    *aResult = nsIAbPreferMailFormat::unknown;

  // First, build some arrays with the original recipients.
  nsTArray<nsMsgRecipient> recipientsList[MAX_OF_RECIPIENT_ARRAY];

  nsAutoString originalRecipients[MAX_OF_RECIPIENT_ARRAY];
  m_compFields->GetTo(originalRecipients[0]);
  m_compFields->GetCc(originalRecipients[1]);
  m_compFields->GetBcc(originalRecipients[2]);

  PRUint32 i, j, k;

  for (i = 0; i < MAX_OF_RECIPIENT_ARRAY; ++i)
  {
    if (originalRecipients[i].IsEmpty())
      continue;

    rv = m_compFields->SplitRecipientsEx(originalRecipients[i],
                                         recipientsList[i]);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Then look them up in the Addressbooks
  PRBool stillNeedToSearch = PR_TRUE;
  nsCOMPtr<nsIAbDirectory> abDirectory;
  nsCOMPtr<nsIAbCard> existingCard;
  nsCOMPtr<nsIMutableArray> mailListAddresses;
  nsCOMPtr<nsIMsgHeaderParser> parser(do_GetService(NS_MAILNEWS_MIME_HEADER_PARSER_CONTRACTID));
  nsCOMPtr<nsISupportsArray> mailListArray(do_CreateInstance(NS_SUPPORTSARRAY_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIRDFService> rdfService(do_GetService("@mozilla.org/rdf/rdf-service;1", &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMArray<nsIAbDirectory> addrbookDirArray;
  rv = GetABDirectories(NS_LITERAL_CSTRING(kAllDirectoryRoot), rdfService,
                        addrbookDirArray);
  if (NS_SUCCEEDED(rv))
  {
    nsString dirPath;
    PRUint32 nbrAddressbook = addrbookDirArray.Count();

    for (k = 0; k < nbrAddressbook && stillNeedToSearch; ++k)
    {
      // Avoid recursive mailing lists
      if (abDirectory && (addrbookDirArray[k] == abDirectory))
      {
        stillNeedToSearch = PR_FALSE;
        break;
      }

      abDirectory = addrbookDirArray[k];

      PRBool supportsMailingLists;
      rv = abDirectory->GetSupportsMailingLists(&supportsMailingLists);
      if (NS_FAILED(rv) || !supportsMailingLists)
        continue;

      // Ensure the existing list is empty before filling it
      mailListArray->Clear();

      // Collect all mailing lists defined in this address book
      rv = BuildMailListArray(abDirectory, mailListArray);
      if (NS_FAILED(rv))
        return rv;

      stillNeedToSearch = PR_FALSE;
      for (i = 0; i < MAX_OF_RECIPIENT_ARRAY; i ++)
      {
        // Note: We check this each time to allow for length changes.
        for (j = 0; j < recipientsList[i].Length(); ++j)
        {
          nsMsgRecipient &recipient = recipientsList[i][j];
          if (!recipient.mProcessed)
          {
            // First check if it's a mailing list
            if (NS_SUCCEEDED(GetMailListAddresses(recipient.mAddress,
                                                  mailListArray,
                                                  getter_AddRefs(mailListAddresses))))
            {
              // It is, so populate it if we are required to do so.
              if (aPopulateMailList)
              {
                  PRUint32 nbrAddresses = 0;
                  for (mailListAddresses->GetLength(&nbrAddresses); nbrAddresses > 0; nbrAddresses --)
                  {
                    existingCard = do_QueryElementAt(mailListAddresses, 
                                                     nbrAddresses - 1, &rv);
                    if (NS_FAILED(rv))
                      return rv;

                    nsMsgRecipient newRecipient;
                    nsAutoString pDisplayName;

                    PRBool bIsMailList;
                    rv = existingCard->GetIsMailList(&bIsMailList);
                    if (NS_FAILED(rv))
                      return rv;

                    rv = existingCard->GetDisplayName(pDisplayName);
                    if (NS_FAILED(rv))
                      return rv;

                    if (bIsMailList)
                      rv = existingCard->GetPropertyAsAString(kNotesProperty, newRecipient.mEmail);
                    else
                      rv = existingCard->GetPrimaryEmail(newRecipient.mEmail);

                    if (NS_FAILED(rv))
                      return rv;

                    if (parser)
                      parser->MakeFullAddress(pDisplayName, newRecipient.mEmail,
                                              newRecipient.mAddress);

                    if (newRecipient.mAddress.IsEmpty())
                    {
                      // oops, parser problem! I will try to do my best...
                      newRecipient.mAddress = pDisplayName;
                      newRecipient.mAddress.AppendLiteral(" <");
                      if (bIsMailList)
                      {
                        if (!newRecipient.mEmail.IsEmpty())
                          newRecipient.mAddress += newRecipient.mEmail;
                        else
                          newRecipient.mAddress += pDisplayName;
                      }
                      else
                        newRecipient.mAddress += newRecipient.mEmail;
                      newRecipient.mAddress.Append(PRUnichar('>'));
                    }

                    if (newRecipient.mAddress.IsEmpty())
                      continue;

                    // Now we need to insert the new address into the list of
                    // recipient
                    if (bIsMailList)
                    {
                      stillNeedToSearch = PR_TRUE;
                    }
                    else
                    {
                      newRecipient.mPreferFormat = nsIAbPreferMailFormat::unknown;
                      rv = existingCard->GetPropertyAsUint32(
                          kPreferMailFormatProperty, &newRecipient.mPreferFormat);
                      if (NS_SUCCEEDED(rv))
                        newRecipient.mProcessed = PR_TRUE;
                    }
                    rv = recipientsList[i].InsertElementAt(j + 1, newRecipient) ? NS_OK : NS_ERROR_FAILURE;
                    if (NS_FAILED(rv))
                      return rv;
                  }
                  recipientsList[i].RemoveElementAt(j);
                 --j;
              }
              else
                recipient.mProcessed = PR_TRUE;

              continue;
            }

            if (!abDirectory)
            {
              stillNeedToSearch = PR_TRUE;
              continue;
            }

            // find a card that contains this e-mail address 
            rv = abDirectory->CardForEmailAddress(NS_ConvertUTF16toUTF8(recipient.mEmail),
                                                  getter_AddRefs(existingCard));

            if (NS_SUCCEEDED(rv) && existingCard)
            {
              recipient.mPreferFormat = nsIAbPreferMailFormat::unknown;
              rv = existingCard->GetPropertyAsUint32(kPreferMailFormatProperty,
                                                     &recipient.mPreferFormat);
              if (NS_SUCCEEDED(rv))
                recipient.mProcessed = PR_TRUE;

              PRBool readOnly;
              rv = abDirectory->GetReadOnly(&readOnly);
              NS_ENSURE_SUCCESS(rv,rv);

              // bump the popularity index for this card since we are about to send e-mail to it
              PRUint32 popularityIndex = 0;
              if (!readOnly)
              {
                if (NS_FAILED(existingCard->GetPropertyAsUint32(
                      kPopularityIndexProperty, &popularityIndex)))
                {
                  // TB 2 wrote the popularity value as hex, so if we get here,
                  // then we've probably got a hex value. We'll convert it back
                  // to decimal, as that's the best we can do.

                  nsCString hexPopularity;
                  if (NS_SUCCEEDED(existingCard->GetPropertyAsAUTF8String(kPopularityIndexProperty, hexPopularity)))
                  {
                    nsresult errorCode = NS_OK;
                    popularityIndex = hexPopularity.ToInteger(&errorCode, 16);
                    if (errorCode)
                      // We failed, just set it to zero.
                      popularityIndex = 0;
                  }                   
                  else
                    // We couldn't get it as a string either, so just reset to
                    // zero.
                    popularityIndex = 0;
                }

                existingCard->SetPropertyAsUint32(kPopularityIndexProperty,
                                                  ++popularityIndex);
                abDirectory->ModifyCard(existingCard);
              }
            }
            else
              stillNeedToSearch = PR_TRUE;
          }
        }
      }
    }
  }

  // Finally return the list of non HTML recipient if requested and/or rebuilt
  // the recipient field. Also, check for domain preference when preferFormat
  // is unknown
  nsAutoString recipientsStr;
  nsAutoString nonHtmlRecipientsStr;
  nsString plaintextDomains;
  nsString htmlDomains;
  nsAutoString domain;

  nsCOMPtr<nsIPrefBranch> prefBranch (do_GetService(NS_PREFSERVICE_CONTRACTID));
  if (prefBranch)
  {
    NS_GetLocalizedUnicharPreferenceWithDefault(prefBranch, "mailnews.plaintext_domains", EmptyString(),
                                                plaintextDomains);
    NS_GetLocalizedUnicharPreferenceWithDefault(prefBranch, "mailnews.html_domains", EmptyString(),
                                                htmlDomains);
  }

  PRBool atLeastOneRecipientPrefersUnknown = PR_FALSE;
  PRBool atLeastOneRecipientPrefersPlainText = PR_FALSE;
  PRBool atLeastOneRecipientPrefersHTML = PR_FALSE;

  for (i = 0; i < MAX_OF_RECIPIENT_ARRAY; ++i)
  {
    PRUint32 nbrRecipients = recipientsList[i].Length();
    if (nbrRecipients == 0)
      continue;
    recipientsStr.SetLength(0);

    for (j = 0; j < nbrRecipients; ++j)
    {
      nsMsgRecipient &recipient = recipientsList[i][j];

      // if we don't have a prefer format for a recipient, check the domain in
      // case we have a format defined for it
      if (recipient.mPreferFormat == nsIAbPreferMailFormat::unknown &&
          (plaintextDomains.Length() || htmlDomains.Length()))
      {
        PRInt32 atPos = recipient.mEmail.FindChar('@');
        if (atPos >= 0)
        {
          recipient.mEmail.Right(domain, recipient.mEmail.Length() - atPos - 1);
          // when we move to frozen linkage this should be:
          // if (plaintextDomains.Find(domain, CaseInsensitiveCompare) >= 0)
          if (FindInReadable(domain, plaintextDomains, nsCaseInsensitiveStringComparator()))
            recipient.mPreferFormat = nsIAbPreferMailFormat::plaintext;
          else
            // when we move to frozen linkage this should be:
            // if (htmlDomains.Find(domain, CaseInsensitiveCompare) >= 0)
            if (FindInReadable(domain, htmlDomains, nsCaseInsensitiveStringComparator()))
              recipient.mPreferFormat = nsIAbPreferMailFormat::html;
        }
      }

      switch (recipient.mPreferFormat)
      {
      case nsIAbPreferMailFormat::html:
        atLeastOneRecipientPrefersHTML = PR_TRUE;
        break;

      case nsIAbPreferMailFormat::plaintext:
        atLeastOneRecipientPrefersPlainText = PR_TRUE;
        break;

      default: // nsIAbPreferMailFormat::unknown
        atLeastOneRecipientPrefersUnknown = PR_TRUE;
        break;
      }

      if (aPopulateMailList)
      {
        if (!recipientsStr.IsEmpty())
          recipientsStr.Append(PRUnichar(','));
        recipientsStr.Append(recipient.mAddress);
      }

      if (aReturnNonHTMLRecipients &&
          recipient.mPreferFormat != nsIAbPreferMailFormat::html)
      {
        if (!nonHtmlRecipientsStr.IsEmpty())
          nonHtmlRecipientsStr.Append(PRUnichar(','));
        nonHtmlRecipientsStr.Append(recipient.mEmail);
      }
    }

    if (aPopulateMailList)
    {
      switch (i)
      {
      case 0 : m_compFields->SetTo(recipientsStr);  break;
      case 1 : m_compFields->SetCc(recipientsStr);  break;
      case 2 : m_compFields->SetBcc(recipientsStr); break;
      }
    }
  }

  if (aReturnNonHTMLRecipients)
    aNonHTMLRecipients = nonHtmlRecipientsStr;

  if (atLeastOneRecipientPrefersUnknown)
    *aResult = nsIAbPreferMailFormat::unknown;
  else if (atLeastOneRecipientPrefersHTML)
  {
    // if we have at least one recipient that prefers html
    // and at least one that recipients that prefers plain text
    // we need to return unknown, so that we can prompt the user
    if (atLeastOneRecipientPrefersPlainText)
      *aResult = nsIAbPreferMailFormat::unknown;
    else
      *aResult = nsIAbPreferMailFormat::html;
  }
  else
  {
    NS_ASSERTION(atLeastOneRecipientPrefersPlainText, "at least one should prefer plain text");
    *aResult = nsIAbPreferMailFormat::plaintext;
  }

  return rv;
}

/* Decides which tags trigger which convertible mode, i.e. here is the logic
   for BodyConvertible */
// Helper function. Parameters are not checked.
nsresult nsMsgCompose::TagConvertible(nsIDOMNode *node,  PRInt32 *_retval)
{
    nsresult rv;

    *_retval = nsIMsgCompConvertible::No;

    PRUint16 nodeType;
    rv = node->GetNodeType(&nodeType);
    if (NS_FAILED(rv))
      return rv;

    nsAutoString element;
    rv = node->GetNodeName(element);
    if (NS_FAILED(rv))
      return rv;

    nsCOMPtr<nsIDOMNode> pItem;
    if      (
              nodeType == nsIDOMNode::TEXT_NODE ||
              element.LowerCaseEqualsLiteral("br") ||
              element.LowerCaseEqualsLiteral("p") ||
              element.LowerCaseEqualsLiteral("pre") ||
              element.LowerCaseEqualsLiteral("tt") ||
              element.LowerCaseEqualsLiteral("html") ||
              element.LowerCaseEqualsLiteral("head") ||
              element.LowerCaseEqualsLiteral("title")
            )
    {
      *_retval = nsIMsgCompConvertible::Plain;
    }
    else if (
              //element.LowerCaseEqualsLiteral("blockquote") || // see below
              element.LowerCaseEqualsLiteral("ul") ||
              element.LowerCaseEqualsLiteral("ol") ||
              element.LowerCaseEqualsLiteral("li") ||
              element.LowerCaseEqualsLiteral("dl") ||
              element.LowerCaseEqualsLiteral("dt") ||
              element.LowerCaseEqualsLiteral("dd")
            )
    {
      *_retval = nsIMsgCompConvertible::Yes;
    }
    else if (
              //element.LowerCaseEqualsLiteral("a") || // see below
              element.LowerCaseEqualsLiteral("h1") ||
              element.LowerCaseEqualsLiteral("h2") ||
              element.LowerCaseEqualsLiteral("h3") ||
              element.LowerCaseEqualsLiteral("h4") ||
              element.LowerCaseEqualsLiteral("h5") ||
              element.LowerCaseEqualsLiteral("h6") ||
              element.LowerCaseEqualsLiteral("hr") ||
              (
                mConvertStructs
                &&
                (
                  element.LowerCaseEqualsLiteral("em") ||
                  element.LowerCaseEqualsLiteral("strong") ||
                  element.LowerCaseEqualsLiteral("code") ||
                  element.LowerCaseEqualsLiteral("b") ||
                  element.LowerCaseEqualsLiteral("i") ||
                  element.LowerCaseEqualsLiteral("u")
                )
              )
            )
    {
      *_retval = nsIMsgCompConvertible::Altering;
    }
    else if (element.LowerCaseEqualsLiteral("body"))
    {
      *_retval = nsIMsgCompConvertible::Plain;

      nsCOMPtr<nsIDOMElement> domElement = do_QueryInterface(node);
      if (domElement)
      {
        PRBool hasAttribute;
        nsAutoString color;
        if (NS_SUCCEEDED(domElement->HasAttribute(NS_LITERAL_STRING("background"), &hasAttribute))
            && hasAttribute)  // There is a background image
          *_retval = nsIMsgCompConvertible::No;
        else if (NS_SUCCEEDED(domElement->HasAttribute(NS_LITERAL_STRING("text"), &hasAttribute)) &&
                 hasAttribute &&
                 NS_SUCCEEDED(domElement->GetAttribute(NS_LITERAL_STRING("text"), color)) &&
                 !color.EqualsLiteral("#000000")) {
          *_retval = nsIMsgCompConvertible::Altering;
        }
        else if (NS_SUCCEEDED(domElement->HasAttribute(NS_LITERAL_STRING("bgcolor"), &hasAttribute)) &&
                 hasAttribute &&
                 NS_SUCCEEDED(domElement->GetAttribute(NS_LITERAL_STRING("bgcolor"), color)) &&
                 !color.LowerCaseEqualsLiteral("#ffffff")) {
          *_retval = nsIMsgCompConvertible::Altering;
        }
		else if (NS_SUCCEEDED(domElement->HasAttribute(NS_LITERAL_STRING("dir"), &hasAttribute))
            && hasAttribute)  // dir=rtl attributes should not downconvert
          *_retval = nsIMsgCompConvertible::No;

        //ignore special color setting for link, vlink and alink at this point.
      }

    }
    else if (element.LowerCaseEqualsLiteral("blockquote"))
    {
      // Skip <blockquote type="cite">
      *_retval = nsIMsgCompConvertible::Yes;

      nsCOMPtr<nsIDOMNamedNodeMap> pAttributes;
      if (NS_SUCCEEDED(node->GetAttributes(getter_AddRefs(pAttributes)))
          && pAttributes)
      {
        nsAutoString typeName; typeName.AssignLiteral("type");
        if (NS_SUCCEEDED(pAttributes->GetNamedItem(typeName,
                                                   getter_AddRefs(pItem)))
            && pItem)
        {
          nsAutoString typeValue;
          if (NS_SUCCEEDED(pItem->GetNodeValue(typeValue)))
          {
            typeValue.StripChars("\"");
            if (typeValue.LowerCaseEqualsLiteral("cite"))
              *_retval = nsIMsgCompConvertible::Plain;
          }
        }
      }
    }
    else if (
              element.LowerCaseEqualsLiteral("div") ||
              element.LowerCaseEqualsLiteral("span") ||
              element.LowerCaseEqualsLiteral("a")
            )
    {
      /* Do some special checks for these tags. They are inside this |else if|
         for performance reasons */
      nsCOMPtr<nsIDOMNamedNodeMap> pAttributes;

      /* First, test, if the <a>, <div> or <span> is inserted by our
         [TXT|HTML]->HTML converter */
      /* This is for an edge case: A Mozilla user replies to plaintext per HTML
         and the recipient of that HTML msg, also a Mozilla user, replies to
         that again. Then we'll have to recognize the stuff inserted by our
         TXT->HTML converter. */
      if (NS_SUCCEEDED(node->GetAttributes(getter_AddRefs(pAttributes)))
          && pAttributes)
      {
        nsAutoString className;
        className.AssignLiteral("class");
        if (NS_SUCCEEDED(pAttributes->GetNamedItem(className,
                                                   getter_AddRefs(pItem)))
            && pItem)
        {
          nsAutoString classValue;
          if (NS_SUCCEEDED(pItem->GetNodeValue(classValue))
              && (classValue.EqualsIgnoreCase("moz-txt", 7) ||
                  classValue.EqualsIgnoreCase("\"moz-txt", 8)))
          {
            *_retval = nsIMsgCompConvertible::Plain;
            return rv;  // Inconsistent :-(
          }
        }
      }

      // Maybe, it's an <a> element inserted by another recognizer (e.g. 4.x')
      if (element.LowerCaseEqualsLiteral("a"))
      {
        /* Ignore anchor tag, if the URI is the same as the text
           (as inserted by recognizers) */
        *_retval = nsIMsgCompConvertible::Altering;

        if (NS_SUCCEEDED(node->GetAttributes(getter_AddRefs(pAttributes)))
            && pAttributes)
        {
          nsAutoString hrefName; hrefName.AssignLiteral("href");
          if (NS_SUCCEEDED(pAttributes->GetNamedItem(hrefName,
                                                     getter_AddRefs(pItem)))
              && pItem)
          {
            nsAutoString hrefValue;
            PRBool hasChild;
            if (NS_SUCCEEDED(pItem->GetNodeValue(hrefValue))
                && NS_SUCCEEDED(node->HasChildNodes(&hasChild)) && hasChild)
            {
              nsCOMPtr<nsIDOMNodeList> children;
              if (NS_SUCCEEDED(node->GetChildNodes(getter_AddRefs(children)))
                  && children
                  && NS_SUCCEEDED(children->Item(0, getter_AddRefs(pItem)))
                  && pItem)
              {
                nsAutoString textValue;
                if (NS_SUCCEEDED(pItem->GetNodeValue(textValue))
                    && textValue == hrefValue)
                  *_retval = nsIMsgCompConvertible::Plain;
              }
            }
          }
        }
      }

      // Lastly, test, if it is just a "simple" <div> or <span>
      else if (
                element.LowerCaseEqualsLiteral("div") ||
                element.LowerCaseEqualsLiteral("span")
              )
      {
        /* skip only if no style attribute */
        *_retval = nsIMsgCompConvertible::Plain;

        if (NS_SUCCEEDED(node->GetAttributes(getter_AddRefs(pAttributes)))
            && pAttributes)
        {
          nsAutoString styleName;
          styleName.AssignLiteral("style");
          if (NS_SUCCEEDED(pAttributes->GetNamedItem(styleName,
                                                     getter_AddRefs(pItem)))
              && pItem)
          {
            nsAutoString styleValue;
            if (NS_SUCCEEDED(pItem->GetNodeValue(styleValue))
                && !styleValue.IsEmpty())
              *_retval = nsIMsgCompConvertible::No;
          }
        }
      }
    }

    return rv;
}

nsresult nsMsgCompose::_BodyConvertible(nsIDOMNode *node, PRInt32 *_retval)
{
    NS_ENSURE_TRUE(node && _retval, NS_ERROR_NULL_POINTER);

    nsresult rv;
    PRInt32 result;

    // Check this node
    rv = TagConvertible(node, &result);
    if (NS_FAILED(rv))
        return rv;

    // Walk tree recursively to check the children
    PRBool hasChild;
    if (NS_SUCCEEDED(node->HasChildNodes(&hasChild)) && hasChild)
    {
      nsCOMPtr<nsIDOMNodeList> children;
      if (NS_SUCCEEDED(node->GetChildNodes(getter_AddRefs(children)))
          && children)
      {
        PRUint32 nbrOfElements;
        rv = children->GetLength(&nbrOfElements);
        for (PRUint32 i = 0; NS_SUCCEEDED(rv) && i < nbrOfElements; i++)
        {
          nsCOMPtr<nsIDOMNode> pItem;
          if (NS_SUCCEEDED(children->Item(i, getter_AddRefs(pItem)))
              && pItem)
          {
            PRInt32 curresult;
            rv = _BodyConvertible(pItem, &curresult);
            if (NS_SUCCEEDED(rv) && curresult > result)
              result = curresult;
          }
        }
      }
    }

    *_retval = result;
    return rv;
}

nsresult nsMsgCompose::BodyConvertible(PRInt32 *_retval)
{
    NS_ENSURE_TRUE(_retval, NS_ERROR_NULL_POINTER);

    nsresult rv;

    if (!m_editor)
      return NS_ERROR_FAILURE;

    nsCOMPtr<nsIDOMElement> rootElement;
    rv = m_editor->GetRootElement(getter_AddRefs(rootElement));
    if (NS_FAILED(rv) || nsnull == rootElement)
      return rv;

    nsCOMPtr<nsIDOMNode> node = do_QueryInterface(rootElement);
    if (nsnull == node)
      return NS_ERROR_FAILURE;

    return _BodyConvertible(node, _retval);
}

NS_IMETHODIMP
nsMsgCompose::GetIdentity(nsIMsgIdentity **aIdentity)
{
  NS_ENSURE_ARG_POINTER(aIdentity);
  NS_IF_ADDREF(*aIdentity = m_identity);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgCompose::SetIdentity(nsIMsgIdentity *aIdentity)
{
  NS_ENSURE_ARG_POINTER(aIdentity);

  m_identity = aIdentity;

  nsresult rv;

  if (! m_editor)
    return NS_ERROR_FAILURE;

  nsCOMPtr<nsIDOMElement> rootElement;
  rv = m_editor->GetRootElement(getter_AddRefs(rootElement));
  if (NS_FAILED(rv) || nsnull == rootElement)
    return rv;

  //First look for the current signature, if we have one
  nsCOMPtr<nsIDOMNode> lastNode;
  nsCOMPtr<nsIDOMNode> node;
  nsCOMPtr<nsIDOMNode> tempNode;
  nsAutoString tagLocalName;

  rv = rootElement->GetLastChild(getter_AddRefs(lastNode));
  if (NS_SUCCEEDED(rv) && nsnull != lastNode)
  {
    node = lastNode;
    if (m_composeHTML)
    {
      /* In html, the signature is inside an element with
         class="moz-signature", it's must be the last node */
      nsCOMPtr<nsIDOMElement> element = do_QueryInterface(node);
      if (element)
      {
        nsAutoString attributeName;
        nsAutoString attributeValue;
        attributeName.AssignLiteral("class");

        rv = element->GetAttribute(attributeName, attributeValue);
        if (NS_SUCCEEDED(rv))
        {
          if (attributeValue.Find("moz-signature", PR_TRUE) != kNotFound)
          {
            //Now, I am sure I get the right node!
            m_editor->BeginTransaction();
            node->GetPreviousSibling(getter_AddRefs(tempNode));
            rv = m_editor->DeleteNode(node);
            if (NS_FAILED(rv))
            {
              m_editor->EndTransaction();
              return rv;
            }

            //Also, remove the <br> right before the signature.
            if (tempNode)
            {
              tempNode->GetLocalName(tagLocalName);
              if (tagLocalName.EqualsLiteral("BR"))
                m_editor->DeleteNode(tempNode);
            }
            m_editor->EndTransaction();
          }
        }
      }
    }
    else
    {
      //In plain text, we have to walk back the dom look for the pattern <br>-- <br>
      PRUint16 nodeType;
      PRInt32 searchState = 0; //0=nothing, 1=br 2='-- '+br, 3=br+'-- '+br

      do
      {
        node->GetNodeType(&nodeType);
        node->GetLocalName(tagLocalName);
        switch (searchState)
        {
          case 0:
            if (nodeType == nsIDOMNode::ELEMENT_NODE && tagLocalName.EqualsLiteral("BR"))
              searchState = 1;
            break;

          case 1:
            searchState = 0;
            if (nodeType == nsIDOMNode::TEXT_NODE)
            {
              nsString nodeValue;
              node->GetNodeValue(nodeValue);
              if (nodeValue.EqualsLiteral("-- "))
                searchState = 2;
            }
            else
              if (nodeType == nsIDOMNode::ELEMENT_NODE && tagLocalName.EqualsLiteral("BR"))
              {
                searchState = 1;
                break;
              }
            break;

          case 2:
            if (nodeType == nsIDOMNode::ELEMENT_NODE && tagLocalName.EqualsLiteral("BR"))
              searchState = 3;
            else
              searchState = 0;
            break;
        }

        tempNode = node;
      } while (searchState != 3 && NS_SUCCEEDED(tempNode->GetPreviousSibling(getter_AddRefs(node))) && node);

      if (searchState == 3)
      {
        //Now, I am sure I get the right node!
        m_editor->BeginTransaction();

        tempNode = lastNode;
        lastNode = node;
        do
        {
          node = tempNode;
          node->GetPreviousSibling(getter_AddRefs(tempNode));
          rv = m_editor->DeleteNode(node);
          if (NS_FAILED(rv))
          {
            m_editor->EndTransaction();
            return rv;
          }

        } while (node != lastNode && tempNode);
        m_editor->EndTransaction();
      }
    }
  }

  if (!CheckIncludeSignaturePrefs(aIdentity))
    return NS_OK;

  //Then add the new one if needed
  nsAutoString aSignature;

  // No delimiter needed if not a compose window
  PRBool noDelimiter;
  switch (mType)
  {
    case nsIMsgCompType::New :
    case nsIMsgCompType::NewsPost :
    case nsIMsgCompType::MailToUrl :
    case nsIMsgCompType::ForwardAsAttachment :
      noDelimiter = PR_FALSE;
      break;
    default :
      noDelimiter = PR_TRUE;
      break;
  }

  ProcessSignature(aIdentity, noDelimiter, &aSignature);

  if (!aSignature.IsEmpty())
  {
    TranslateLineEnding(aSignature);

    m_editor->BeginTransaction();
    PRInt32 reply_on_top = 0;
    PRBool sig_bottom = PR_TRUE;
    aIdentity->GetReplyOnTop(&reply_on_top);
    aIdentity->GetSigBottom(&sig_bottom);
    PRBool sigOnTop = (reply_on_top == 1 && !sig_bottom);
    if (sigOnTop && noDelimiter)
      m_editor->BeginningOfDocument();
    else
      m_editor->EndOfDocument();
    if (m_composeHTML)
    {
      nsCOMPtr<nsIHTMLEditor> htmlEditor (do_QueryInterface(m_editor));
      rv = htmlEditor->InsertHTML(aSignature);
    }
    else
    {
      nsCOMPtr<nsIPlaintextEditor> textEditor (do_QueryInterface(m_editor));
      rv = textEditor->InsertText(aSignature);
    }
    if (sigOnTop && noDelimiter)
      m_editor->EndOfDocument();
    m_editor->EndTransaction();
  }

  return rv;
}

NS_IMETHODIMP nsMsgCompose::CheckCharsetConversion(nsIMsgIdentity *identity, char **fallbackCharset, PRBool *_retval)
{
  NS_ENSURE_ARG_POINTER(identity);
  NS_ENSURE_ARG_POINTER(_retval);

  nsresult rv = m_compFields->CheckCharsetConversion(fallbackCharset, _retval);
  NS_ENSURE_SUCCESS(rv, rv);

  if (*_retval)
  {
    nsString fullName;
    nsString organization;
    nsAutoString identityStrings;

    rv = identity->GetFullName(fullName);
    NS_ENSURE_SUCCESS(rv, rv);
    if (!fullName.IsEmpty())
      identityStrings.Append(fullName);

    rv = identity->GetOrganization(organization);
    NS_ENSURE_SUCCESS(rv, rv);
    if (!organization.IsEmpty())
      identityStrings.Append(organization);

    if (!identityStrings.IsEmpty())
    {
      // use fallback charset if that's already set
      const char *charset = (fallbackCharset && *fallbackCharset) ? *fallbackCharset : m_compFields->GetCharacterSet();
      *_retval = nsMsgI18Ncheck_data_in_charset_range(charset, identityStrings.get(),
                                                      fallbackCharset);
    }
  }

  return NS_OK;
}

NS_IMPL_ADDREF(nsMsgMailList)
NS_IMPL_RELEASE(nsMsgMailList)

NS_INTERFACE_MAP_BEGIN(nsMsgMailList)
   NS_INTERFACE_MAP_ENTRY_AMBIGUOUS(nsISupports, nsISupports)
NS_INTERFACE_MAP_END


nsMsgMailList::nsMsgMailList()
{
}

nsMsgMailList::nsMsgMailList(nsString listName, nsString listDescription, nsIAbDirectory* directory) :
  mDirectory(directory)
{
  nsCOMPtr<nsIMsgHeaderParser> parser (do_GetService(NS_MAILNEWS_MIME_HEADER_PARSER_CONTRACTID));

  if (parser)
    parser->MakeFullAddress(listName,
                            listDescription.IsEmpty() ? listName : listDescription,
                            mFullName);

  if (mFullName.IsEmpty())
  {
      //oops, parser problem! I will try to do my best...
      mFullName = listName;
      mFullName.AppendLiteral(" <");
      if (listDescription.IsEmpty())
        mFullName += listName;
      else
        mFullName += listDescription;
      mFullName.Append(PRUnichar('>'));
  }

  mDirectory = directory;
}

nsMsgMailList::~nsMsgMailList()
{
}

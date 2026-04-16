#include "HCADOcctDocument.h"

#include <Message.hxx>
#include <Standard_ErrorHandler.hxx>
#include <TCollection_AsciiString.hxx>

IMPLEMENT_STANDARD_RTTIEXT(HCADOcctDocument, Standard_Transient)

HCADOcctDocument::HCADOcctDocument()
{
  try
  {
    OCC_CATCH_SIGNALS
    myApp = XCAFApp_Application::GetApplication();
  }
  catch (const Standard_Failure& theFailure)
  {
    Message::SendFail(TCollection_AsciiString("Error creating XCAF application: ")
                      + theFailure.GetMessageString());
  }
}

HCADOcctDocument::~HCADOcctDocument()
{
}

void HCADOcctDocument::InitDoc()
{
  if (!myOcafDoc.IsNull())
  {
    if (myOcafDoc->HasOpenCommand())
    {
      myOcafDoc->AbortCommand();
    }

    myOcafDoc->Main().Root().ForgetAllAttributes(Standard_True);
    myApp->Close(myOcafDoc);
    myOcafDoc.Nullify();
  }

  myApp->NewDocument(TCollection_ExtendedString("BinXCAF"), myOcafDoc);
  if (!myOcafDoc.IsNull())
  {
    myOcafDoc->SetUndoLimit(10);
  }
}

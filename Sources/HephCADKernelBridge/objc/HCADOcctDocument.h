#ifndef HCADOcctDocument_h
#define HCADOcctDocument_h

#include <TDocStd_Document.hxx>
#include <XCAFApp_Application.hxx>

class HCADOcctDocument : public Standard_Transient
{
  DEFINE_STANDARD_RTTIEXT(HCADOcctDocument, Standard_Transient)

public:
  Standard_EXPORT HCADOcctDocument();
  Standard_EXPORT virtual ~HCADOcctDocument();

  Standard_EXPORT void InitDoc();

  Handle(TDocStd_Document)& ChangeDocument() { return myOcafDoc; }
  const Handle(TDocStd_Document)& Document() const { return myOcafDoc; }

private:
  Handle(XCAFApp_Application) myApp;
  Handle(TDocStd_Document) myOcafDoc;
};

#endif

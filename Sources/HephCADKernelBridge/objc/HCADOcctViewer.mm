#include "HCADOcctViewer.h"

#include <OpenGl_GraphicDriver.hxx>

#include <AIS_ConnectedInteractive.hxx>
#include <AIS_Shape.hxx>
#include <Aspect_DisplayConnection.hxx>
#include <BRep_Builder.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepTools.hxx>
#include <Cocoa_Window.hxx>
#include <IFSelect_ReturnStatus.hxx>
#include <Message.hxx>
#include <Prs3d_Drawer.hxx>
#include <StdPrs_ToolTriangulatedShape.hxx>
#include <STEPCAFControl_Reader.hxx>
#include <TCollection_HAsciiString.hxx>
#include <TDF_ChildIterator.hxx>
#include <TDF_LabelSequence.hxx>
#include <TDF_Tool.hxx>
#include <TDataStd_Name.hxx>
#include <TopExp_Explorer.hxx>
#include <Transfer_TransientProcess.hxx>
#include <XCAFDoc_ColorTool.hxx>
#include <XCAFDoc_DocumentTool.hxx>
#include <XSControl_TransferReader.hxx>

#include <algorithm>

HCADOcctViewer::HCADOcctViewer()
{
  myDocument = new HCADOcctDocument();
}

HCADOcctViewer::~HCADOcctViewer()
{
  Release();
}

bool HCADOcctViewer::InitViewer(UIView* theView)
{
  if (myDocument.IsNull())
  {
    myDocument = new HCADOcctDocument();
  }

  EAGLContext* aRenderContext = [EAGLContext currentContext];
  if (theView == nil || aRenderContext == nil)
  {
    Release();
    return false;
  }

  if (!myView.IsNull())
  {
    myView->MustBeResized();
    myView->Invalidate();
    return true;
  }

  Handle(Aspect_DisplayConnection) aDisplayConnection = new Aspect_DisplayConnection();
  Handle(Graphic3d_GraphicDriver) aGraphicDriver = new OpenGl_GraphicDriver(aDisplayConnection);

  myViewer = new V3d_Viewer(aGraphicDriver);
  myViewer->SetDefaultLights();
  myViewer->SetLightOn();

  myContext = new AIS_InteractiveContext(myViewer);
  myContext->SetDisplayMode((Standard_Integer)AIS_DisplayMode::AIS_Shaded, Standard_False);

  myView = myViewer->CreateView();
  myView->TriedronDisplay(Aspect_TOTP_LEFT_LOWER, Quantity_NOC_WHITE, 0.15, V3d_ZBUFFER);

  Handle(Cocoa_Window) aWindow = new Cocoa_Window(theView);
  myView->SetWindow(aWindow, aRenderContext);
  if (!aWindow->IsMapped())
  {
    aWindow->Map();
  }

  myView->Redraw();
  myView->MustBeResized();
  return true;
}

void HCADOcctViewer::Release()
{
  myPresentations.clear();
  myBodies.clear();
  myContext.Nullify();
  if (!myView.IsNull())
  {
    myView->Remove();
  }
  myView.Nullify();
  myViewer.Nullify();
  myDocument.Nullify();
}

void HCADOcctViewer::Redraw()
{
  if (!myView.IsNull())
  {
    myView->Invalidate();
    myView->Redraw();
  }
}

void HCADOcctViewer::FitAll()
{
  if (!myView.IsNull())
  {
    myView->FitAll();
    myView->ZFitAll();
    Redraw();
  }
}

void HCADOcctViewer::StartRotation(int theX, int theY)
{
  if (!myView.IsNull())
  {
    myView->StartRotation(theX, theY);
  }
}

void HCADOcctViewer::Rotation(int theX, int theY)
{
  if (!myView.IsNull())
  {
    myView->Rotation(theX, theY);
    Redraw();
  }
}

void HCADOcctViewer::Pan(int theDx, int theDy)
{
  if (!myView.IsNull())
  {
    myView->Pan(theDx, theDy, 1, Standard_False);
    Redraw();
  }
}

void HCADOcctViewer::Zoom(int theX, int theY, double theDelta)
{
  if (myView.IsNull())
  {
    return;
  }

  if (theX >= 0 && theY >= 0)
  {
    myView->StartZoomAtPoint(theX, theY);
    myView->ZoomAtPoint(0, 0, (int)theDelta, (int)theDelta);
  }
  else
  {
    double aCoeff = Abs(theDelta) / 100.0 + 1.0;
    aCoeff = theDelta > 0.0 ? aCoeff : 1.0 / aCoeff;
    myView->SetZoom(aCoeff, Standard_True);
  }
  Redraw();
}

std::string HCADOcctViewer::Select(int theX, int theY)
{
  if (myContext.IsNull())
  {
    return "";
  }

  myContext->ClearSelected(Standard_False);
  myContext->MoveTo(theX, theY, myView, Standard_False);
  myContext->SelectDetected(AIS_SelectionScheme_Replace);
  myContext->InitSelected();
  if (!myContext->MoreSelected())
  {
    Redraw();
    return "";
  }

  Handle(AIS_InteractiveObject) anInteractive = myContext->SelectedInteractive();
  if (anInteractive.IsNull() || !anInteractive->HasOwner())
  {
    Redraw();
    return "";
  }

  Handle(TCollection_HAsciiString) anOwner = Handle(TCollection_HAsciiString)::DownCast(anInteractive->GetOwner());
  Redraw();
  return anOwner.IsNull() ? "" : std::string(anOwner->String().ToCString());
}

const std::vector<HCADBodyRecord>& HCADOcctViewer::LoadDemoBox()
{
  if (myContext.IsNull())
  {
    myBodies = {{"demo-box-001", "Demo Box", "brep", true, 0.0}};
    return myBodies;
  }

  clearScene();

  TopoDS_Shape aShape = BRepPrimAPI_MakeBox(120.0, 80.0, 50.0).Shape();
  BRepMesh_IncrementalMesh(aShape, 1.0, Standard_False, 0.5, Standard_True);

  Handle(AIS_Shape) aPresentation = new AIS_Shape(aShape);
  aPresentation->SetColor(Quantity_NOC_STEELBLUE);
  myContext->Display(aPresentation, Standard_False);
  registerPresentation("demo-box-001", "Demo Box", aPresentation);

  FitAll();
  return myBodies;
}

bool HCADOcctViewer::ImportSTEP(const std::string& theFilename, std::string& theError)
{
  if (myContext.IsNull())
  {
    theError = "Viewer must be initialized before importing STEP.";
    return false;
  }

  if (myDocument.IsNull())
  {
    myDocument = new HCADOcctDocument();
  }
  myDocument->InitDoc();

  STEPCAFControl_Reader aReader;
  Handle(XSControl_WorkSession) aSession = aReader.Reader().WS();

  try
  {
    IFSelect_ReturnStatus aReadStatus = aReader.ReadFile(theFilename.c_str());
    if (aReadStatus != IFSelect_RetDone)
    {
      clearSession(aSession);
      theError = "STEPCAFControl_Reader failed to read the STEP file.";
      return false;
    }

    if (!aReader.Transfer(myDocument->ChangeDocument()))
    {
      clearSession(aSession);
      theError = "STEPCAFControl_Reader failed to transfer the STEP file into XDE.";
      return false;
    }

    clearSession(aSession);
  }
  catch (const Standard_Failure& theFailure)
  {
    theError = theFailure.GetMessageString();
    return false;
  }

  Handle(XCAFDoc_ShapeTool) aShapeTool = XCAFDoc_DocumentTool::ShapeTool(myDocument->Document()->Main());
  Handle(XCAFDoc_ColorTool) aColorTool = XCAFDoc_DocumentTool::ColorTool(myDocument->Document()->Main());

  TDF_LabelSequence aLabels;
  aShapeTool->GetFreeShapes(aLabels);
  if (aLabels.IsEmpty())
  {
    theError = "No free shapes were found in the imported STEP document.";
    return false;
  }

  TopoDS_Compound aCompound;
  BRep_Builder aBuildTool;
  aBuildTool.MakeCompound(aCompound);
  for (Standard_Integer aLabelIndex = 1; aLabelIndex <= aLabels.Length(); ++aLabelIndex)
  {
    TopoDS_Shape aShape;
    const TDF_Label& aLabel = aLabels.Value(aLabelIndex);
    if (XCAFDoc_ShapeTool::GetShape(aLabel, aShape))
    {
      aBuildTool.Add(aCompound, aShape);
    }
  }

  Handle(Prs3d_Drawer) aDrawer = myContext->DefaultDrawer();
  Standard_Real aDeflection = StdPrs_ToolTriangulatedShape::GetDeflection(aCompound, aDrawer);
  if (!BRepTools::Triangulation(aCompound, aDeflection))
  {
    BRepMesh_IncrementalMesh anAlgo;
    anAlgo.ChangeParameters().Deflection = aDeflection;
    anAlgo.ChangeParameters().Angle = aDrawer->DeviationAngle();
    anAlgo.ChangeParameters().InParallel = Standard_True;
    anAlgo.SetShape(aCompound);
    anAlgo.Perform();
  }

  clearScene();

  HCADMapOfPrsForShapes aMapOfShapes;
  XCAFPrs_Style aDefaultStyle;
  aDefaultStyle.SetColorSurf(Quantity_NOC_GRAY65);
  aDefaultStyle.SetColorCurv(Quantity_NOC_GRAY65);
  for (Standard_Integer aLabelIndex = 1; aLabelIndex <= aLabels.Length(); ++aLabelIndex)
  {
    displayWithChildren(*aShapeTool, *aColorTool, aLabels.Value(aLabelIndex), TopLoc_Location(), aDefaultStyle, "", aMapOfShapes);
  }

  FitAll();
  return true;
}

const std::vector<HCADBodyRecord>& HCADOcctViewer::Bodies() const
{
  return myBodies;
}

void HCADOcctViewer::SetTransparency(const std::string& theBodyID, double theValue)
{
  if (myContext.IsNull())
  {
    return;
  }

  auto anIt = myPresentations.find(theBodyID);
  if (anIt == myPresentations.end())
  {
    return;
  }

  double aClampedValue = std::max(0.0, std::min(1.0, theValue));
  myContext->SetTransparency(anIt->second, aClampedValue, Standard_False);
  if (HCADBodyRecord* aRecord = findBodyRecord(theBodyID))
  {
    aRecord->transparency = aClampedValue;
  }
  Redraw();
}

void HCADOcctViewer::SetVisibility(const std::string& theBodyID, bool theVisible)
{
  if (myContext.IsNull())
  {
    return;
  }

  auto anIt = myPresentations.find(theBodyID);
  if (anIt == myPresentations.end())
  {
    return;
  }

  if (theVisible)
  {
    myContext->Display(anIt->second, Standard_False);
  }
  else
  {
    myContext->Erase(anIt->second, Standard_False);
  }

  if (HCADBodyRecord* aRecord = findBodyRecord(theBodyID))
  {
    aRecord->isVisible = theVisible;
  }
  Redraw();
}

void HCADOcctViewer::ApplyIsolation(const std::vector<std::string>& theBodyIDs)
{
  if (myContext.IsNull())
  {
    return;
  }

  std::unordered_map<std::string, bool> anIsolatedBodies;
  for (const std::string& aBodyID : theBodyIDs)
  {
    anIsolatedBodies[aBodyID] = true;
  }

  for (auto& aPair : myPresentations)
  {
    bool isVisible = anIsolatedBodies.find(aPair.first) != anIsolatedBodies.end();
    if (isVisible)
    {
      myContext->Display(aPair.second, Standard_False);
    }
    else
    {
      myContext->Erase(aPair.second, Standard_False);
    }

    if (HCADBodyRecord* aRecord = findBodyRecord(aPair.first))
    {
      aRecord->isVisible = isVisible;
    }
  }
  Redraw();
}

void HCADOcctViewer::ClearIsolation()
{
  if (myContext.IsNull())
  {
    return;
  }

  for (auto& aPair : myPresentations)
  {
    myContext->Display(aPair.second, Standard_False);
    if (HCADBodyRecord* aRecord = findBodyRecord(aPair.first))
    {
      aRecord->isVisible = true;
    }
  }
  Redraw();
}

void HCADOcctViewer::clearSession(const Handle(XSControl_WorkSession)& theSession)
{
  if (theSession.IsNull())
  {
    return;
  }

  Handle(Transfer_TransientProcess) aMapReader = theSession->TransferReader()->TransientProcess();
  if (!aMapReader.IsNull())
  {
    aMapReader->Clear();
  }

  Handle(XSControl_TransferReader) aTransferReader = theSession->TransferReader();
  if (!aTransferReader.IsNull())
  {
    aTransferReader->Clear(1);
  }
}

void HCADOcctViewer::clearScene()
{
  myBodies.clear();
  myPresentations.clear();
  if (!myContext.IsNull())
  {
    myContext->ClearSelected(Standard_False);
    myContext->RemoveAll(Standard_False);
  }
}

void HCADOcctViewer::displayWithChildren(XCAFDoc_ShapeTool&             theShapeTool,
                                         XCAFDoc_ColorTool&             theColorTool,
                                         const TDF_Label&               theLabel,
                                         const TopLoc_Location&         theParentTrsf,
                                         const XCAFPrs_Style&           theParentStyle,
                                         const TCollection_AsciiString& theParentId,
                                         HCADMapOfPrsForShapes&         theMapOfShapes)
{
  TDF_Label aReferenceLabel = theLabel;
  if (theShapeTool.IsReference(theLabel))
  {
    theShapeTool.GetReferredShape(theLabel, aReferenceLabel);
  }

  TCollection_AsciiString anEntry;
  TDF_Tool::Entry(theLabel, anEntry);
  if (!theParentId.IsEmpty())
  {
    anEntry = theParentId + "|" + anEntry;
  }

  if (!theShapeTool.IsAssembly(aReferenceLabel))
  {
    Handle(AIS_InteractiveObject) anInteractive;
    if (!theMapOfShapes.Find(aReferenceLabel, anInteractive))
    {
      anInteractive = new HCADCafShapePrs(aReferenceLabel, theParentStyle, Graphic3d_NameOfMaterial_ShinyPlastified);
      theMapOfShapes.Bind(aReferenceLabel, anInteractive);
    }

    const std::string aBodyID = bodyIDForEntry(anEntry);
    const std::string aBodyName = bodyNameForLabel(aReferenceLabel, anEntry);

    Handle(TCollection_HAsciiString) anOwner = new TCollection_HAsciiString(aBodyID.c_str());
    Handle(AIS_ConnectedInteractive) aConnected = new AIS_ConnectedInteractive();
    aConnected->Connect(anInteractive, theParentTrsf.Transformation());
    aConnected->SetOwner(anOwner);
    aConnected->SetLocalTransformation(theParentTrsf.Transformation());
    aConnected->SetHilightMode(1);
    myContext->Display(aConnected, Standard_False);
    registerPresentation(aBodyID, aBodyName, aConnected);
    return;
  }

  XCAFPrs_Style aDefaultStyle = theParentStyle;
  Quantity_Color aColor;
  if (theColorTool.GetColor(aReferenceLabel, XCAFDoc_ColorGen, aColor))
  {
    aDefaultStyle.SetColorCurv(aColor);
    aDefaultStyle.SetColorSurf(aColor);
  }
  if (theColorTool.GetColor(aReferenceLabel, XCAFDoc_ColorSurf, aColor))
  {
    aDefaultStyle.SetColorSurf(aColor);
  }
  if (theColorTool.GetColor(aReferenceLabel, XCAFDoc_ColorCurv, aColor))
  {
    aDefaultStyle.SetColorCurv(aColor);
  }

  for (TDF_ChildIterator aChildIterator(aReferenceLabel); aChildIterator.More(); aChildIterator.Next())
  {
    TDF_Label aChildLabel = aChildIterator.Value();
    if (!aChildLabel.IsNull() && (aChildLabel.HasAttribute() || aChildLabel.HasChild()))
    {
      TopLoc_Location aTransform = theParentTrsf * theShapeTool.GetLocation(aChildLabel);
      displayWithChildren(theShapeTool, theColorTool, aChildLabel, aTransform, aDefaultStyle, anEntry, theMapOfShapes);
    }
  }
}

std::string HCADOcctViewer::bodyIDForEntry(const TCollection_AsciiString& theEntry) const
{
  std::string aResult = theEntry.IsEmpty() ? "body" : std::string(theEntry.ToCString());
  for (char& aCharacter : aResult)
  {
    if (aCharacter == '\n' || aCharacter == ':' || aCharacter == ' ')
    {
      aCharacter = '_';
    }
  }
  return aResult;
}

std::string HCADOcctViewer::bodyNameForLabel(const TDF_Label& theLabel, const TCollection_AsciiString& theEntry) const
{
  Handle(TDataStd_Name) aName;
  if (theLabel.FindAttribute(TDataStd_Name::GetID(), aName))
  {
    TCollection_AsciiString anAsciiName(aName->Get());
    if (!anAsciiName.IsEmpty())
    {
      return std::string(anAsciiName.ToCString());
    }
  }
  return std::string(theEntry.IsEmpty() ? "Imported Body" : theEntry.ToCString());
}

void HCADOcctViewer::registerPresentation(const std::string& theBodyID,
                                          const std::string& theName,
                                          const Handle(AIS_InteractiveObject)& thePresentation)
{
  myPresentations[theBodyID] = thePresentation;
  HCADBodyRecord aRecord;
  aRecord.identifier = theBodyID;
  aRecord.name = theName;
  aRecord.kind = "brep";
  myBodies.push_back(aRecord);
}

HCADBodyRecord* HCADOcctViewer::findBodyRecord(const std::string& theBodyID)
{
  for (HCADBodyRecord& aBody : myBodies)
  {
    if (aBody.identifier == theBodyID)
    {
      return &aBody;
    }
  }
  return nullptr;
}

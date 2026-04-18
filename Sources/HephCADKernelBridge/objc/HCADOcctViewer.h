#ifndef HCADOcctViewer_h
#define HCADOcctViewer_h

#include "HCADCafShapePrs.h"
#include "HCADOcctDocument.h"

#include <AIS_InteractiveContext.hxx>
#include <NCollection_DataMap.hxx>
#include <TopLoc_Location.hxx>
#include <V3d_View.hxx>
#include <V3d_Viewer.hxx>
#include <XCAFDoc_ColorTool.hxx>
#include <XCAFDoc_ShapeTool.hxx>
#include <XCAFPrs_Style.hxx>
#include <XSControl_WorkSession.hxx>

#import <UIKit/UIKit.h>

#include <string>
#include <utility>
#include <unordered_map>
#include <vector>

struct HCADBodyRecord
{
  std::string identifier;
  std::string name;
  std::string kind;
  bool isVisible = true;
  double transparency = 0.0;
};

typedef NCollection_DataMap<TDF_Label, Handle(AIS_InteractiveObject)> HCADMapOfPrsForShapes;

class HCADOcctViewer
{
public:
  Standard_EXPORT HCADOcctViewer();
  Standard_EXPORT virtual ~HCADOcctViewer();

  Standard_EXPORT bool InitViewer(UIView* theView);
  Standard_EXPORT void Release();
  Standard_EXPORT void Redraw();
  Standard_EXPORT void FitAll();

  Standard_EXPORT void StartRotation(int theX, int theY);
  Standard_EXPORT void Rotation(int theX, int theY);
  Standard_EXPORT void Pan(int theDx, int theDy);
  Standard_EXPORT void Zoom(int theX, int theY, double theDelta);
  Standard_EXPORT std::string Select(int theX, int theY);

  Standard_EXPORT const std::vector<HCADBodyRecord>& LoadDemoBox();
  Standard_EXPORT bool ImportSTEP(const std::string& theFilename, std::string& theError);
  Standard_EXPORT bool ValidateClosedProfile(const std::vector<std::pair<double, double>>& thePoints,
                                             const std::string& thePlaneIdentifier,
                                             std::string& theError);
  Standard_EXPORT bool LoadExtrudedProfile(const std::vector<std::pair<double, double>>& thePoints,
                                           const std::string& thePlaneIdentifier,
                                           double theDepth,
                                           std::string& theError);

  Standard_EXPORT const std::vector<HCADBodyRecord>& Bodies() const;
  Standard_EXPORT void SetTransparency(const std::string& theBodyID, double theValue);
  Standard_EXPORT void SetVisibility(const std::string& theBodyID, bool theVisible);
  Standard_EXPORT void ApplyIsolation(const std::vector<std::string>& theBodyIDs);
  Standard_EXPORT void ClearIsolation();

private:
  void clearSession(const Handle(XSControl_WorkSession)& theSession);
  void clearScene();
  void displayWithChildren(XCAFDoc_ShapeTool&             theShapeTool,
                           XCAFDoc_ColorTool&             theColorTool,
                           const TDF_Label&               theLabel,
                           const TopLoc_Location&         theParentTrsf,
                           const XCAFPrs_Style&           theParentStyle,
                           const TCollection_AsciiString& theParentId,
                           HCADMapOfPrsForShapes&         theMapOfShapes);
  std::string bodyIDForEntry(const TCollection_AsciiString& theEntry) const;
  std::string bodyNameForLabel(const TDF_Label& theLabel, const TCollection_AsciiString& theEntry) const;
  void registerPresentation(const std::string& theBodyID,
                            const std::string& theName,
                            const Handle(AIS_InteractiveObject)& thePresentation);
  HCADBodyRecord* findBodyRecord(const std::string& theBodyID);

private:
  Handle(V3d_Viewer) myViewer;
  Handle(V3d_View) myView;
  Handle(AIS_InteractiveContext) myContext;
  Handle(HCADOcctDocument) myDocument;
  std::vector<HCADBodyRecord> myBodies;
  std::unordered_map<std::string, Handle(AIS_InteractiveObject)> myPresentations;
};

#endif

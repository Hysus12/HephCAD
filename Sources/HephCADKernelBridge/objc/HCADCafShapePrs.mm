#include "HCADCafShapePrs.h"

IMPLEMENT_STANDARD_RTTIEXT(HCADCafShapePrs, XCAFPrs_AISObject)

HCADCafShapePrs::HCADCafShapePrs(const TDF_Label&                theLabel,
                                 const XCAFPrs_Style&            theStyle,
                                 const Graphic3d_MaterialAspect& theMaterial)
: XCAFPrs_AISObject(theLabel),
  myDefaultStyle(theStyle)
{
  SetMaterial(theMaterial);
}

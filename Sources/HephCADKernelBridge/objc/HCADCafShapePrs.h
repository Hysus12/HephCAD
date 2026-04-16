#ifndef HCADCafShapePrs_h
#define HCADCafShapePrs_h

#include <TDF_Label.hxx>
#include <XCAFPrs_AISObject.hxx>
#include <XCAFPrs_Style.hxx>

class HCADCafShapePrs : public XCAFPrs_AISObject
{
  DEFINE_STANDARD_RTTIEXT(HCADCafShapePrs, XCAFPrs_AISObject)

public:
  HCADCafShapePrs(const TDF_Label&                theLabel,
                  const XCAFPrs_Style&            theStyle,
                  const Graphic3d_MaterialAspect& theMaterial);

  virtual void DefaultStyle(XCAFPrs_Style& theStyle) const Standard_OVERRIDE
  {
    theStyle = myDefaultStyle;
  }

private:
  XCAFPrs_Style myDefaultStyle;
};

#endif

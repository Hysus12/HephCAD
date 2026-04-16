#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@class HCADViewerViewController;

@interface HCADGLView : UIView

@property (nonatomic, weak) HCADViewerViewController *viewerController;

- (void)drawView;

@end

NS_ASSUME_NONNULL_END

#import <UIKit/UIKit.h>

#import "../HephCADKernelBridge/include/HCADKernelSession.h"

NS_ASSUME_NONNULL_BEGIN

@class HCADViewerViewController;

@protocol HCADViewerSelectionDelegate <NSObject>

- (void)viewerController:(HCADViewerViewController *)viewerController
 didSelectBodyWithIdentifier:(nullable NSString *)bodyIdentifier;

@end

@interface HCADViewerViewController : UIViewController

@property (nonatomic, strong) HCADKernelSession *kernelSession;
@property (nonatomic, weak, nullable) id<HCADViewerSelectionDelegate> selectionDelegate;

- (void)reloadScene;
- (void)applyIsolationForBodyIDs:(nullable NSArray<NSString *> *)bodyIDs;
- (void)applyTransparency:(double)value forBodyID:(NSString *)bodyID;
- (void)updateReferenceImageNamed:(nullable NSString *)name
                          opacity:(double)opacity
                        positionX:(double)positionX
                        positionY:(double)positionY
                         rotation:(double)rotation
                            scale:(double)scale;

@end

NS_ASSUME_NONNULL_END

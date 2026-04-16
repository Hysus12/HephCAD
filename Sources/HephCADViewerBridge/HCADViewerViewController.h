#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface HCADViewerViewController : UIViewController

- (void)loadSceneWithBodyNames:(NSArray<NSString *> *)bodyNames;
- (void)applyVisibilityForBodyNames:(NSArray<NSString *> *)bodyNames;
- (void)applyIsolationForBodyNames:(nullable NSArray<NSString *> *)bodyNames;
- (void)applyTransparency:(double)value forBodyName:(NSString *)bodyName;
- (void)insertReferenceImagePlaneNamed:(NSString *)name opacity:(double)opacity;
- (nullable NSString *)pickAtPoint:(CGPoint)point;

@end

NS_ASSUME_NONNULL_END

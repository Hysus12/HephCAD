#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface HCADBodyPayload : NSObject

@property (nonatomic, readonly, copy) NSString *identifier;
@property (nonatomic, readonly, copy) NSString *name;
@property (nonatomic, readonly, copy) NSString *kind;

- (instancetype)initWithIdentifier:(NSString *)identifier
                              name:(NSString *)name
                              kind:(NSString *)kind;

@end

@interface HCADScenePayload : NSObject

@property (nonatomic, readonly, copy) NSArray<HCADBodyPayload *> *bodies;

- (instancetype)initWithBodies:(NSArray<HCADBodyPayload *> *)bodies;

@end

@interface HCADKernelSession : NSObject

@property (nonatomic, readonly, copy) NSArray<HCADBodyPayload *> *currentBodies;
@property (nonatomic, readonly, nullable, copy) NSString *selectedBodyIdentifier;

- (HCADScenePayload *)makeDemoShape;
- (HCADScenePayload *)importSTEPAtURL:(NSURL *)url error:(NSError * _Nullable * _Nullable)error;
- (BOOL)exportSTEPForBodyIDs:(NSArray<NSString *> *)bodyIDs
                       toURL:(NSURL *)url
                       error:(NSError * _Nullable * _Nullable)error;
- (HCADScenePayload *)loadMeshAtURL:(NSURL *)url
                             format:(NSString *)format
                              error:(NSError * _Nullable * _Nullable)error;
- (BOOL)exportMeshNodeID:(NSString *)nodeID
                   toURL:(NSURL *)url
                  format:(NSString *)format
                   error:(NSError * _Nullable * _Nullable)error;
- (void)setBodyTransparencyWithID:(NSString *)bodyID value:(double)value;
- (void)setBodyVisibilityWithID:(NSString *)bodyID visible:(BOOL)visible;
- (void)prepareViewerInView:(UIView *)view;
- (void)reloadActiveScene;
- (void)drawViewer;
- (void)startRotationAtX:(NSInteger)x y:(NSInteger)y;
- (void)rotateToX:(NSInteger)x y:(NSInteger)y;
- (void)panByDX:(NSInteger)dx dy:(NSInteger)dy;
- (void)zoomAtX:(NSInteger)x y:(NSInteger)y delta:(double)delta;
- (nullable NSString *)selectBodyAtX:(NSInteger)x y:(NSInteger)y;
- (void)setIsolatedBodyIDs:(NSArray<NSString *> * _Nullable)bodyIDs;
- (HCADScenePayload *)extrudeProfilePoints:(NSArray<NSValue *> *)points
                                   onPlane:(NSString *)planeIdentifier
                                     depth:(double)depth
                                     error:(NSError * _Nullable * _Nullable)error;

@end

NS_ASSUME_NONNULL_END

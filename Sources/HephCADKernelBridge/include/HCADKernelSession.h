#import <Foundation/Foundation.h>

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

@end

NS_ASSUME_NONNULL_END

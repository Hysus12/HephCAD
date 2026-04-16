#import "HCADKernelSession.h"

#import "../cpp/KernelSessionStub.hpp"

@implementation HCADBodyPayload

- (instancetype)initWithIdentifier:(NSString *)identifier
                              name:(NSString *)name
                              kind:(NSString *)kind {
    self = [super init];
    if (self) {
        _identifier = [identifier copy];
        _name = [name copy];
        _kind = [kind copy];
    }
    return self;
}

@end

@implementation HCADScenePayload

- (instancetype)initWithBodies:(NSArray<HCADBodyPayload *> *)bodies {
    self = [super init];
    if (self) {
        _bodies = [bodies copy];
    }
    return self;
}

@end

@implementation HCADKernelSession {
    hephcad::KernelSessionStub _stub;
}

- (HCADScenePayload *)makeDemoShape {
    return [self payloadFromBodies:_stub.makeDemoShape()];
}

- (HCADScenePayload *)importSTEPAtURL:(NSURL *)url error:(NSError * _Nullable __autoreleasing *)error {
    auto bodies = _stub.importStep(url.path.UTF8String);
    if (bodies.empty()) {
        if (error != nil) {
            *error = [NSError errorWithDomain:@"HephCAD.KernelSession"
                                         code:1
                                     userInfo:@{NSLocalizedDescriptionKey: @"STEP file could not be loaded by stub backend."}];
        }
        return [[HCADScenePayload alloc] initWithBodies:@[]];
    }
    return [self payloadFromBodies:bodies];
}

- (BOOL)exportSTEPForBodyIDs:(NSArray<NSString *> *)bodyIDs
                       toURL:(NSURL *)url
                       error:(NSError * _Nullable __autoreleasing *)error {
    NSString *content = [NSString stringWithFormat:@"STEP-STUB\nbody_count=%lu\n", (unsigned long)bodyIDs.count];
    NSError *writeError = nil;
    BOOL success = [content writeToURL:url atomically:YES encoding:NSUTF8StringEncoding error:&writeError];
    if (!success && error != nil) {
        *error = writeError;
    }
    return success;
}

- (HCADScenePayload *)loadMeshAtURL:(NSURL *)url
                             format:(NSString *)format
                              error:(NSError * _Nullable __autoreleasing *)error {
    if ([[NSFileManager defaultManager] fileExistsAtPath:url.path] == NO) {
        if (error != nil) {
            *error = [NSError errorWithDomain:@"HephCAD.KernelSession"
                                         code:2
                                     userInfo:@{NSLocalizedDescriptionKey: @"Mesh file not found."}];
        }
        return [[HCADScenePayload alloc] initWithBodies:@[]];
    }
    HCADBodyPayload *body = [[HCADBodyPayload alloc] initWithIdentifier:@"mesh-node-001"
                                                                   name:[NSString stringWithFormat:@"Imported %@", format.uppercaseString]
                                                                   kind:@"mesh"];
    return [[HCADScenePayload alloc] initWithBodies:@[body]];
}

- (BOOL)exportMeshNodeID:(NSString *)nodeID
                   toURL:(NSURL *)url
                  format:(NSString *)format
                   error:(NSError * _Nullable __autoreleasing *)error {
    NSString *content = [NSString stringWithFormat:@"MESH-STUB\nnode=%@\nformat=%@\n", nodeID, format];
    NSError *writeError = nil;
    BOOL success = [content writeToURL:url atomically:YES encoding:NSUTF8StringEncoding error:&writeError];
    if (!success && error != nil) {
        *error = writeError;
    }
    return success;
}

- (void)setBodyTransparencyWithID:(NSString *)bodyID value:(double)value {
    (void)bodyID;
    (void)value;
}

- (void)setBodyVisibilityWithID:(NSString *)bodyID visible:(BOOL)visible {
    (void)bodyID;
    (void)visible;
}

- (HCADScenePayload *)payloadFromBodies:(const std::vector<hephcad::BodyStub>&)bodies {
    NSMutableArray<HCADBodyPayload *> *results = [NSMutableArray arrayWithCapacity:bodies.size()];
    for (const auto& body : bodies) {
        NSString *identifier = [NSString stringWithUTF8String:body.identifier.c_str()];
        NSString *name = [NSString stringWithUTF8String:body.name.c_str()];
        NSString *kind = [NSString stringWithUTF8String:body.kind.c_str()];
        [results addObject:[[HCADBodyPayload alloc] initWithIdentifier:identifier name:name kind:kind]];
    }
    return [[HCADScenePayload alloc] initWithBodies:results];
}

@end

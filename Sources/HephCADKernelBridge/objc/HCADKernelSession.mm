#import "HCADKernelSession.h"

#import "HCADOcctViewer.h"

#include <memory>

typedef NS_ENUM(NSInteger, HCADSceneSource) {
    HCADSceneSourceNone = 0,
    HCADSceneSourceDemo,
    HCADSceneSourceSTEP,
    HCADSceneSourceSketchExtrude
};

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
    std::unique_ptr<HCADOcctViewer> _viewer;
    NSArray<HCADBodyPayload *> *_currentBodies;
    NSString *_selectedBodyIdentifier;
    HCADSceneSource _sceneSource;
    NSURL *_stepURL;
    NSArray<NSValue *> *_sketchProfilePoints;
    NSString *_sketchPlaneIdentifier;
    double _sketchExtrudeDepth;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _viewer = std::make_unique<HCADOcctViewer>();
        _currentBodies = @[];
        _selectedBodyIdentifier = nil;
        _sceneSource = HCADSceneSourceNone;
        _stepURL = nil;
        _sketchProfilePoints = @[];
        _sketchPlaneIdentifier = @"top";
        _sketchExtrudeDepth = 40.0;
    }
    return self;
}

- (NSArray<HCADBodyPayload *> *)currentBodies {
    return _currentBodies;
}

- (NSString *)selectedBodyIdentifier {
    return _selectedBodyIdentifier;
}

- (HCADScenePayload *)makeDemoShape {
    _sceneSource = HCADSceneSourceDemo;
    _stepURL = nil;
    _sketchProfilePoints = @[];

    if (_viewer != nullptr) {
        [self syncBodiesFromRecords:_viewer->Bodies()];
        if (_currentBodies.count == 0) {
            _currentBodies = @[
                [[HCADBodyPayload alloc] initWithIdentifier:@"demo-box-001" name:@"Demo Box" kind:@"brep"]
            ];
        }
    }
    return [[HCADScenePayload alloc] initWithBodies:_currentBodies];
}

- (HCADScenePayload *)importSTEPAtURL:(NSURL *)url error:(NSError * _Nullable __autoreleasing *)error {
    _sceneSource = HCADSceneSourceSTEP;
    _stepURL = url;
    _sketchProfilePoints = @[];

    std::string errorMessage;
    bool didImport = _viewer->ImportSTEP(url.path.UTF8String, errorMessage);
    if (!didImport) {
        if (error != nil) {
            NSString *message = errorMessage.empty() ? @"STEP import failed." : [NSString stringWithUTF8String:errorMessage.c_str()];
            *error = [NSError errorWithDomain:@"HephCAD.KernelSession"
                                         code:1
                                     userInfo:@{NSLocalizedDescriptionKey: message}];
        }
        return [[HCADScenePayload alloc] initWithBodies:@[]];
    }

    [self syncBodiesFromRecords:_viewer->Bodies()];
    _selectedBodyIdentifier = nil;
    return [[HCADScenePayload alloc] initWithBodies:_currentBodies];
}

- (HCADScenePayload *)extrudeProfilePoints:(NSArray<NSValue *> *)points
                                   onPlane:(NSString *)planeIdentifier
                                     depth:(double)depth
                                     error:(NSError * _Nullable __autoreleasing *)error {
    _sceneSource = HCADSceneSourceSketchExtrude;
    _stepURL = nil;
    _sketchProfilePoints = [points copy];
    _sketchPlaneIdentifier = [planeIdentifier copy];
    _sketchExtrudeDepth = depth;

    std::vector<std::pair<double, double>> profilePoints;
    profilePoints.reserve(points.count);
    for (NSValue *value in points) {
        CGPoint point = value.CGPointValue;
        profilePoints.emplace_back(point.x, point.y);
    }

    std::string errorMessage;
    bool didExtrude = _viewer->LoadExtrudedProfile(profilePoints, _sketchPlaneIdentifier.UTF8String, depth, errorMessage);
    if (!didExtrude) {
        if (error != nil) {
            NSString *message = errorMessage.empty() ? @"Sketch extrude failed." : [NSString stringWithUTF8String:errorMessage.c_str()];
            *error = [NSError errorWithDomain:@"HephCAD.KernelSession"
                                         code:3
                                     userInfo:@{NSLocalizedDescriptionKey: message}];
        }
        return [[HCADScenePayload alloc] initWithBodies:@[]];
    }

    [self syncBodiesFromRecords:_viewer->Bodies()];
    _selectedBodyIdentifier = _currentBodies.firstObject.identifier;
    return [[HCADScenePayload alloc] initWithBodies:_currentBodies];
}

- (BOOL)validateClosedProfilePoints:(NSArray<NSValue *> *)points
                            onPlane:(NSString *)planeIdentifier
                              error:(NSError * _Nullable __autoreleasing *)error {
    std::vector<std::pair<double, double>> profilePoints;
    profilePoints.reserve(points.count);
    for (NSValue *value in points) {
        CGPoint point = value.CGPointValue;
        profilePoints.emplace_back(point.x, point.y);
    }

    std::string errorMessage;
    bool isValid = _viewer->ValidateClosedProfile(profilePoints, planeIdentifier.UTF8String, errorMessage);
    if (!isValid && error != nil) {
        NSString *message = errorMessage.empty() ? @"Sketch profile is not valid for a face." : [NSString stringWithUTF8String:errorMessage.c_str()];
        *error = [NSError errorWithDomain:@"HephCAD.KernelSession"
                                     code:4
                                 userInfo:@{NSLocalizedDescriptionKey: message}];
    }
    return isValid;
}

- (BOOL)exportSTEPForBodyIDs:(NSArray<NSString *> *)bodyIDs
                       toURL:(NSURL *)url
                       error:(NSError * _Nullable __autoreleasing *)error {
    NSString *content = [NSString stringWithFormat:@"STEP export placeholder\nbody_count=%lu\n", (unsigned long)bodyIDs.count];
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
    _currentBodies = @[body];
    return [[HCADScenePayload alloc] initWithBodies:_currentBodies];
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
    _viewer->SetTransparency(bodyID.UTF8String, value);
}

- (void)setBodyVisibilityWithID:(NSString *)bodyID visible:(BOOL)visible {
    _viewer->SetVisibility(bodyID.UTF8String, visible);
}

- (void)prepareViewerInView:(UIView *)view {
    if (!_viewer->InitViewer(view)) {
        return;
    }
    [self reloadActiveScene];
}

- (void)reloadActiveScene {
    switch (_sceneSource) {
        case HCADSceneSourceDemo: {
            [self syncBodiesFromRecords:_viewer->LoadDemoBox()];
            break;
        }
        case HCADSceneSourceSTEP: {
            if (_stepURL != nil) {
                std::string errorMessage;
                if (_viewer->ImportSTEP(_stepURL.path.UTF8String, errorMessage)) {
                    [self syncBodiesFromRecords:_viewer->Bodies()];
                }
            }
            break;
        }
        case HCADSceneSourceSketchExtrude: {
            std::vector<std::pair<double, double>> profilePoints;
            profilePoints.reserve(_sketchProfilePoints.count);
            for (NSValue *value in _sketchProfilePoints) {
                CGPoint point = value.CGPointValue;
                profilePoints.emplace_back(point.x, point.y);
            }

            std::string errorMessage;
            if (_viewer->LoadExtrudedProfile(profilePoints, _sketchPlaneIdentifier.UTF8String, _sketchExtrudeDepth, errorMessage)) {
                [self syncBodiesFromRecords:_viewer->Bodies()];
            }
            break;
        }
        case HCADSceneSourceNone:
            break;
    }
}

- (void)drawViewer {
    _viewer->Redraw();
}

- (void)startRotationAtX:(NSInteger)x y:(NSInteger)y {
    _viewer->StartRotation((int)x, (int)y);
}

- (void)rotateToX:(NSInteger)x y:(NSInteger)y {
    _viewer->Rotation((int)x, (int)y);
}

- (void)panByDX:(NSInteger)dx dy:(NSInteger)dy {
    _viewer->Pan((int)dx, (int)dy);
}

- (void)zoomAtX:(NSInteger)x y:(NSInteger)y delta:(double)delta {
    _viewer->Zoom((int)x, (int)y, delta);
}

- (NSString *)selectBodyAtX:(NSInteger)x y:(NSInteger)y {
    std::string selectedBodyID = _viewer->Select((int)x, (int)y);
    _selectedBodyIdentifier = selectedBodyID.empty() ? nil : [NSString stringWithUTF8String:selectedBodyID.c_str()];
    return _selectedBodyIdentifier;
}

- (void)setIsolatedBodyIDs:(NSArray<NSString *> * _Nullable)bodyIDs {
    if (bodyIDs == nil || bodyIDs.count == 0) {
        _viewer->ClearIsolation();
        return;
    }

    std::vector<std::string> selected;
    selected.reserve(bodyIDs.count);
    for (NSString *bodyID in bodyIDs) {
        selected.push_back(bodyID.UTF8String);
    }
    _viewer->ApplyIsolation(selected);
}

- (void)syncBodiesFromRecords:(const std::vector<HCADBodyRecord>&)records {
    NSMutableArray<HCADBodyPayload *> *payloads = [NSMutableArray arrayWithCapacity:records.size()];
    for (const HCADBodyRecord& record : records) {
        [payloads addObject:[[HCADBodyPayload alloc] initWithIdentifier:[NSString stringWithUTF8String:record.identifier.c_str()]
                                                                   name:[NSString stringWithUTF8String:record.name.c_str()]
                                                                   kind:[NSString stringWithUTF8String:record.kind.c_str()]]];
    }
    _currentBodies = [payloads copy];
}

@end

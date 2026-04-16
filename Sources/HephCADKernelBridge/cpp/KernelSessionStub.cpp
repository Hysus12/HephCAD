#include "KernelSessionStub.hpp"

#include <filesystem>

namespace hephcad {

std::vector<BodyStub> KernelSessionStub::makeDemoShape() const {
    return {
        {"demo-body-001", "Demo Box", "brep"},
        {"demo-body-002", "Reference Mesh Proxy", "mesh"}
    };
}

std::vector<BodyStub> KernelSessionStub::importStep(const std::string& path) const {
    const bool exists = std::filesystem::exists(path);
    if (!exists) {
        return {};
    }
    return {
        {"step-body-001", "Imported STEP Body", "brep"}
    };
}

} // namespace hephcad
